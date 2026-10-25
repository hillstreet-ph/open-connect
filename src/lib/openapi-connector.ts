import { normalizeRemoteMcpEndpoint } from "./remote-mcp.ts";
export type ApiOperation = {
  name: string;
  description: string;
  method: string;
  path: string;
  parameters: Array<{ name: string; in: string; required?: boolean }>;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; openWorldHint: boolean };
};
export function openApiOperations(value: unknown): {
  title: string;
  description: string;
  endpoint: string;
  tools: ApiOperation[];
} {
  if (!value || typeof value !== "object") throw new Error("Upload an OpenAPI JSON object");
  const spec = value as Record<string, unknown>;
  if (!String(spec["openapi"] || "").startsWith("3."))
    throw new Error("OpenAPI 3.x JSON is required");
  const info = spec["info"] as { title?: string; description?: string } | undefined;
  const servers = spec["servers"] as Array<{ url?: string }> | undefined;
  const endpoint = normalizeRemoteMcpEndpoint("custom_mcp", servers?.[0]?.url || "");
  const paths = spec["paths"] as Record<string, Record<string, Record<string, unknown>>>;
  if (!paths || typeof paths !== "object") throw new Error("OpenAPI paths are required");
  const tools: ApiOperation[] = [];
  const names = new Set<string>();
  for (const [path, methods] of Object.entries(paths)) {
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("..") || /[?#]/.test(path))
      throw new Error("OpenAPI operation has an unsafe path");
    for (const [method, op] of Object.entries(methods)) {
      if (!["get", "post", "put", "patch", "delete", "head"].includes(method)) continue;
      const name = String(op["operationId"] || `${method}_${path.replace(/[^a-zA-Z0-9]/g, "_")}`);
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(name) || names.has(name))
        throw new Error("Operation names must be unique safe identifiers");
      names.add(name);
      const params = [
        ...(Array.isArray(methods["parameters"]) ? methods["parameters"] : []),
        ...(Array.isArray(op["parameters"]) ? op["parameters"] : []),
      ] as Array<{
        name: string;
        in: string;
        required?: boolean;
        schema?: Record<string, unknown>;
      }>;
      if (
        !Array.isArray(params) ||
        params.some((p) => !p || !p.name || !["path", "query"].includes(p.in))
      )
        throw new Error(
          "Only explicit path/query parameters are supported; use the credential field for auth headers",
        );
      const placeholders = [...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
      if (placeholders.some((name) => !params.some((p) => p.name === name && p.in === "path")))
        throw new Error("Every path placeholder needs an explicit path parameter");
      if (new Set(params.map((p) => p.name)).size !== params.length)
        throw new Error("Parameter names must be unique within an operation");
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const p of params) {
        if (
          !/^[a-zA-Z0-9_.-]+$/.test(p.name) ||
          ["__proto__", "prototype", "constructor"].includes(p.name)
        )
          throw new Error("Unsafe parameter name");
        properties[p.name] = p.schema || { type: "string" };
        if (p.required || p.in === "path") required.push(p.name);
      }
      const body = op["requestBody"] as
        | { content?: Record<string, { schema?: Record<string, unknown> }>; required?: boolean }
        | undefined;
      if (body) {
        const schema = body.content?.["application/json"]?.schema;
        if (!schema) throw new Error("Only JSON request bodies are supported");
        properties["body"] = schema;
        if (body.required) required.push("body");
      }
      const inputSchema = { type: "object", properties, required, additionalProperties: false };
      if (JSON.stringify(inputSchema).includes('"$ref"'))
        throw new Error(
          "Inline OpenAPI parameter/body schemas before connecting; unresolved references require review",
        );
      tools.push({
        name,
        description: String(
          op["summary"] || op["description"] || `${method.toUpperCase()} ${path}`,
        ).slice(0, 1000),
        method: method.toUpperCase(),
        path,
        parameters: params.map((p) => ({
          name: p.name,
          in: p.in,
          ...(p.required ? { required: true } : {}),
        })),
        inputSchema,
        annotations: {
          readOnlyHint: ["get", "head"].includes(method),
          destructiveHint: method === "delete",
          openWorldHint: true,
        },
      });
      if (tools.length > 100) throw new Error("Use a schema with at most 100 operations");
    }
  }
  if (!tools.length) throw new Error("No supported OpenAPI operations found");
  return {
    title: info?.title || "Custom API",
    description: info?.description || "",
    endpoint,
    tools,
  };
}
