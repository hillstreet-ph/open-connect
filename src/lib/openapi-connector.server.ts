import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/cfworker";
import { openApiOperations } from "./openapi-connector.ts";
import { publicFetch } from "./public-fetch.server.ts";
import { normalizeAuthHeader } from "./connection-auth-header.ts";
export async function callOpenApiTool(
  connection: { metadata: unknown },
  name: string,
  args: Record<string, unknown>,
  credential: string,
) {
  const metadata = connection.metadata as Record<string, unknown>;
  const api = openApiOperations(metadata["openapi"]);
  const op = api.tools.find((t) => t.name === name);
  if (!op) throw new Error("Unknown OpenAPI operation");
  const checked = new CfWorkerJsonSchemaValidator().getValidator(op.inputSchema)(args);
  if (!checked.valid)
    throw new Error("Operation arguments do not match the reviewed OpenAPI schema");
  let path = op.path;
  const query = new URLSearchParams();
  for (const p of op.parameters) {
    const value = args[p.name];
    if (value === undefined) continue;
    if (p.in === "path" && (/[/%\\]/.test(String(value)) || [".", ".."].includes(String(value))))
      throw new Error("Path parameters must be single safe segments");
    if (p.in === "path") path = path.replace(`{${p.name}}`, encodeURIComponent(String(value)));
    else query.set(p.name, String(value));
  }
  const url = new URL(api.endpoint.replace(/\/$/, "") + path);
  url.search = query.toString();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (credential && metadata["auth_type"] !== "none") {
    if (metadata["auth_type"] === "api_key")
      headers[normalizeAuthHeader(metadata["auth_header"])] = credential;
    else headers["Authorization"] = `Bearer ${credential}`;
  }
  if (args["body"] !== undefined) headers["Content-Type"] = "application/json";
  const response = await publicFetch(url, {
    method: op.method,
    headers,
    ...(args["body"] !== undefined ? { body: JSON.stringify(args["body"]) } : {}),
  });
  if (!response.ok)
    throw new Error(
      `API operation returned HTTP ${response.status}; check account permissions and provider availability`,
    );
  const text = await response.text();
  return {
    isError: false,
    content: [
      {
        type: "text" as const,
        text: credential ? text.replaceAll(credential, "[REDACTED]") : text,
      },
    ],
  };
}
