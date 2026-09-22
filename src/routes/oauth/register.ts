import { createFileRoute } from "@tanstack/react-router";
import { oauthDatabase } from "@/lib/oauth-client.server";
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
            const u = new URL(value);
            if (
              typeof value !== "string" ||
              value.length > 2048 ||
              u.protocol !== "https:" ||
              u.username ||
              u.password ||
              u.hash
            )
              throw Error();
          }
          if (body.token_endpoint_auth_method && body.token_endpoint_auth_method !== "none")
            throw Error();
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
