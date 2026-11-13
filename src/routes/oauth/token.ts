import { oauthResource } from "@/lib/mcp-oauth-contract";
import { createFileRoute } from "@tanstack/react-router";
import { oauthDatabase } from "@/lib/oauth-client.server";
import { gateMtls } from "@/lib/mtls.server";
import { resolveClientAuth } from "@/lib/oauth-client-auth";
const headers = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "cache-control": "no-store",
  pragma: "no-cache",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });
const invalidClient = () =>
  new Response(
    JSON.stringify({ error: "invalid_client", error_description: "Client authentication failed." }),
    { status: 401, headers: { ...headers, "www-authenticate": 'Basic realm="open-connect"' } },
  );
export const Route = createFileRoute("/oauth/token")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            ...headers,
            "access-control-allow-methods": "POST, OPTIONS",
            "access-control-allow-headers": "Content-Type, Authorization",
          },
        }),
      POST: async ({ request }) => {
        const mtls = gateMtls(request);
        if (!mtls.ok) return json({ error: mtls.error }, mtls.status);
        try {
          const p: Record<string, unknown> = request.headers
            .get("content-type")
            ?.includes("application/json")
            ? await request.json()
            : Object.fromEntries(await request.formData());
          if (p["grant_type"] !== "authorization_code")
            return json({ error: "unsupported_grant_type" }, 400);
          if (
            ["code", "code_verifier", "redirect_uri"].some((k) => typeof p[k] !== "string" || !p[k])
          )
            return json({ error: "invalid_request" }, 400);
          const client = resolveClientAuth(request.headers.get("authorization"), p);
          if (!client.ok)
            return client.error === "invalid_client"
              ? invalidClient()
              : json({ error: "invalid_request" }, 400);
          let resource: string;
          try {
            resource = oauthResource(p["resource"]);
          } catch {
            return json({ error: "invalid_target" }, 400);
          }
          const db = oauthDatabase();
          let { data, error } = await db.rpc("oc_exchange_oauth_code_client", {
            p_resource: resource,
            p_code: p["code"] as string,
            p_verifier: p["code_verifier"] as string,
            p_client_id: client.clientId,
            p_redirect_uri: p["redirect_uri"] as string,
            p_client_secret: client.clientSecret,
          });
          // Rollout guard: before the integrations migration exists, public
          // clients keep using the previous exchange. Secrets are never accepted
          // on this path because the old function cannot verify them.
          if (error?.code === "PGRST202" && !client.clientSecret) {
            ({ data, error } = await db.rpc("oc_exchange_oauth_code_resource", {
              p_resource: resource,
              p_code: p["code"] as string,
              p_verifier: p["code_verifier"] as string,
              p_client_id: client.clientId,
              p_redirect_uri: p["redirect_uri"] as string,
            }));
          }
          if (error?.message?.includes("invalid_client")) return invalidClient();
          return error
            ? json(
                {
                  error: "invalid_grant",
                  error_description: "Invalid, expired, or already used authorization code.",
                },
                400,
              )
            : json(data);
        } catch {
          return json({ error: "invalid_request" }, 400);
        }
      },
    },
  },
});
