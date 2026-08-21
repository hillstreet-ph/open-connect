import { createFileRoute } from "@tanstack/react-router";
import {
  isValidCodeVerifier,
  isValidPkceMethod,
  parseAuthCode,
  verifyPkce,
} from "@/lib/oauth.server";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "cache-control": "no-store",
    },
  });
}

export const Route = createFileRoute("/oauth/token")({
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
        const contentType = request.headers.get("content-type") ?? "";
        let params: Record<string, string> = {};
        if (contentType.includes("application/json")) {
          const body = (await request.json().catch(() => ({}))) as Record<string, string>;
          params = body;
        } else {
          const form = await request.formData().catch(() => null);
          if (form) {
            form.forEach((v, k) => {
              if (typeof v === "string") params[k] = v;
            });
          }
        }

        const grant = params["grant_type"];
        if (grant !== "authorization_code" && grant !== "refresh_token") {
          return json({ error: "unsupported_grant_type" }, 400);
        }

        if (grant === "refresh_token") {
          const refresh = params["refresh_token"];
          if (!refresh?.startsWith("oc_live_")) {
            return json({ error: "invalid_grant" }, 400);
          }
          return json({
            access_token: refresh,
            token_type: "Bearer",
            expires_in: 86400 * 365,
            refresh_token: refresh,
            scope: "mcp:connect models:read models:invoke resources:read",
          });
        }

        // OAuth 2.1 authorization_code: PKCE S256 + exact redirect_uri required
        const code = params["code"];
        const verifier = params["code_verifier"];
        const redirectUri = params["redirect_uri"];

        if (!code || !verifier) {
          return json(
            {
              error: "invalid_request",
              error_description: "code and code_verifier required (OAuth 2.1 PKCE S256)",
            },
            400,
          );
        }

        if (!redirectUri) {
          return json(
            {
              error: "invalid_request",
              error_description: "redirect_uri is required and must match the authorization request",
            },
            400,
          );
        }

        if (!isValidCodeVerifier(verifier)) {
          return json(
            {
              error: "invalid_request",
              error_description:
                "code_verifier must be 43–128 unreserved characters (RFC 7636)",
            },
            400,
          );
        }

        const payload = parseAuthCode(code);
        if (!payload) {
          return json(
            { error: "invalid_grant", error_description: "Invalid or expired code" },
            400,
          );
        }

        if (!isValidPkceMethod(payload.code_challenge_method)) {
          return json(
            {
              error: "invalid_grant",
              error_description: "Authorization code was not issued with PKCE S256",
            },
            400,
          );
        }

        // OAuth 2.1: exact string match of redirect_uri from the authorization request
        if (redirectUri !== payload.redirect_uri) {
          return json(
            { error: "invalid_grant", error_description: "redirect_uri mismatch" },
            400,
          );
        }

        if (!verifyPkce(verifier, payload.code_challenge, payload.code_challenge_method)) {
          return json(
            {
              error: "invalid_grant",
              error_description: "PKCE S256 verification failed",
            },
            400,
          );
        }

        return json({
          access_token: payload.key,
          token_type: "Bearer",
          expires_in: 86400 * 365,
          refresh_token: payload.key,
          scope: payload.scope ?? "mcp:connect models:read models:invoke resources:read",
        });
      },
    },
  },
});
