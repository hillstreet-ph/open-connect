import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { publicText } from "./public-fetch.server";
import { openApiOperations } from "./openapi-connector";
import { normalizeRemoteMcpEndpoint } from "./remote-mcp";
export const loadPluginSchema = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { url: string }) => ({
    url: normalizeRemoteMcpEndpoint("custom_mcp", input.url),
  }))
  .handler(async ({ data }) => {
    const url = new URL(data.url);
    if (
      [...url.searchParams.keys()].some((key) =>
        /token|secret|key|password|signature|authorization/i.test(key),
      )
    )
      throw new Error("Use a public schema URL without credentials");
    let schema: unknown;
    try {
      schema = JSON.parse(await publicText(url.href));
    } catch {
      throw new Error(
        "Could not load public OpenAPI JSON. Upload an inline OpenAPI 3.x JSON schema instead.",
      );
    }
    openApiOperations(schema);
    return { schema_json: JSON.stringify(schema) };
  });
