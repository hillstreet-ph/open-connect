import { createFileRoute } from "@tanstack/react-router";
import { oauthDatabase } from "@/lib/oauth-client.server";
import { gateMtls } from "@/lib/mtls.server";
const headers = {
  "content-type": "application/json",
  "access-control-allow-origin": "*",
  "cache-control": "no-store",
  pragma: "no-cache",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers });
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
            ["code", "code_verifier", "client_id", "redirect_uri"].some(
              (k) => typeof p[k] !== "string" || !p[k],
            )
          )
            return json({ error: "invalid_request" }, 400);
          const { data, error } = await oauthDatabase().rpc("oc_exchange_oauth_code", {
            p_code: p["code"],
            p_verifier: p["code_verifier"],
            p_client_id: p["client_id"],
            p_redirect_uri: p["redirect_uri"],
          });
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
