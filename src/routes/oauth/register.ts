import { createFileRoute } from "@tanstack/react-router";
import { json, newClientId } from "@/lib/oauth.server";

// re-export helper via local json if needed
function ok(body: unknown, status = 201) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    },
  });
}

export const Route = createFileRoute("/oauth/register")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "POST, OPTIONS",
            "access-control-allow-headers": "Content-Type, Authorization",
          },
        }),
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as {
          client_name?: string;
          redirect_uris?: string[];
          grant_types?: string[];
          response_types?: string[];
          token_endpoint_auth_method?: string;
        };
        const clientId = newClientId();
        return ok({
          client_id: clientId,
          client_id_issued_at: Math.floor(Date.now() / 1000),
          client_name: body.client_name ?? "MCP Client",
          redirect_uris: body.redirect_uris ?? ["https://chatgpt.com/connector/oauth"],
          grant_types: body.grant_types ?? ["authorization_code", "refresh_token"],
          response_types: body.response_types ?? ["code"],
          token_endpoint_auth_method: body.token_endpoint_auth_method ?? "none",
        });
      },
    },
  },
});
