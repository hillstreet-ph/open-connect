import { createFileRoute } from "@tanstack/react-router";
import { oauthDatabase } from "@/lib/oauth-client.server";
import { isAcceptableRedirectUri } from "@/lib/oauth-redirect";
const headers = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "cache-control": "no-store",
};
export const Route = createFileRoute("/oauth/register")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            ...headers,
            "access-control-allow-methods": "POST, OPTIONS",
            "access-control-allow-headers": "Content-Type",
          },
        }),
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          if (
            !Array.isArray(body.redirect_uris) ||
            body.redirect_uris.length < 1 ||
            body.redirect_uris.length > 5
          )
            throw Error();
          for (const value of body.redirect_uris) {
            // https for web clients, http loopback for native clients (RFC 8252 §7.3).
            if (!isAcceptableRedirectUri(value)) throw Error();
          }
          // Native clients omit the auth method or send "none"; both mean public PKCE.
          const authMethod = body.token_endpoint_auth_method;
          if (authMethod && authMethod !== "none") throw Error();
          const { data, error } = await oauthDatabase().rpc("oc_register_oauth_client", {
            p_name: typeof body.client_name === "string" ? body.client_name : "MCP client",
            p_redirect_uris: body.redirect_uris,
          });
          return new Response(JSON.stringify(error ? { error: "temporarily_unavailable" } : data), {
            status: error ? 503 : 201,
            headers,
          });
        } catch {
          return new Response(JSON.stringify({ error: "invalid_client_metadata" }), {
            status: 400,
            headers,
          });
        }
      },
    },
  },
});
