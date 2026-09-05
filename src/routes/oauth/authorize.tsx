import { createFileRoute } from "@tanstack/react-router";
import { createAuthCode, validateAuthorizePkce } from "@/lib/oauth.server";
import { hashKey, KEY_PREFIX } from "@/lib/gateway.server";

export const Route = createFileRoute("/oauth/authorize")({
  ssr: true,
  validateSearch: (search: Record<string, unknown>) => ({
    response_type: typeof search["response_type"] === "string" ? search["response_type"] : undefined,
    client_id: typeof search["client_id"] === "string" ? search["client_id"] : undefined,
    redirect_uri: typeof search["redirect_uri"] === "string" ? search["redirect_uri"] : undefined,
    state: typeof search["state"] === "string" ? search["state"] : undefined,
    scope: typeof search["scope"] === "string" ? search["scope"] : undefined,
    code_challenge: typeof search["code_challenge"] === "string" ? search["code_challenge"] : undefined,
    code_challenge_method:
      typeof search["code_challenge_method"] === "string" ? search["code_challenge_method"] : undefined,
    error: typeof search["error"] === "string" ? search["error"] : undefined,
    error_description:
      typeof search["error_description"] === "string" ? search["error_description"] : undefined,
  }),
  server: {
    handlers: {
      POST: async ({ request }) => {
        const form = await request.formData();
        const apiKey = String(form.get("api_key") ?? "").trim();
        const redirectUri = String(form.get("redirect_uri") ?? "");
        const clientId = String(form.get("client_id") ?? "chatgpt");
        const state = String(form.get("state") ?? "");
        const scope = String(form.get("scope") ?? "mcp:connect models:read models:invoke");
        const codeChallenge = String(form.get("code_challenge") ?? "");
        const codeChallengeMethod = String(form.get("code_challenge_method") ?? "");

        const pkce = validateAuthorizePkce({
          code_challenge: codeChallenge,
          code_challenge_method: codeChallengeMethod || "S256",
        });

        if (!pkce.ok) {
          const q = new URLSearchParams({
            error: pkce.error,
            error_description: pkce.error_description,
            client_id: clientId,
            redirect_uri: redirectUri,
            state,
            scope,
          });
          return new Response(null, {
            status: 302,
            headers: { Location: `/oauth/authorize?${q.toString()}` },
          });
        }

        if (!apiKey.startsWith(KEY_PREFIX) || !redirectUri) {
          return new Response(null, {
            status: 302,
            headers: {
              Location: `/oauth/authorize?error=invalid_request&error_description=${encodeURIComponent("api_key and redirect_uri required")}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`,
            },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await supabaseAdmin
          .from("api_keys")
          .select("id, revoked_at")
          .eq("key_hash", hashKey(apiKey))
          .maybeSingle();

        if (!data || data.revoked_at) {
          const q = new URLSearchParams({
            error: "invalid_api_key",
            client_id: clientId,
            redirect_uri: redirectUri,
            state,
            code_challenge: pkce.code_challenge,
            code_challenge_method: pkce.code_challenge_method,
            scope,
          });
          return new Response(null, {
            status: 302,
            headers: { Location: `/oauth/authorize?${q.toString()}` },
          });
        }

        const code = createAuthCode({
          key: apiKey,
          redirect_uri: redirectUri,
          client_id: clientId,
          code_challenge: pkce.code_challenge,
          code_challenge_method: pkce.code_challenge_method,
          scope,
        });

        const url = new URL(redirectUri);
        url.searchParams.set("code", code);
        if (state) url.searchParams.set("state", state);
        return new Response(null, { status: 302, headers: { Location: url.toString() } });
      },
    },
  },
  component: AuthorizePage,
});

function AuthorizePage() {
  const search = Route.useSearch();
  const redirectUri = search["redirect_uri"] ?? "";
  const clientId = search["client_id"] ?? "mcp-client";
  const state = search["state"] ?? "";
  const scope = search["scope"] ?? "mcp:connect models:read models:invoke resources:read";
  const codeChallenge = search["code_challenge"] ?? "";
  const codeChallengeMethod = search["code_challenge_method"] ?? "S256";
  const error = search["error"];
  const errorDescription = search["error_description"];

  const pkcePreview = validateAuthorizePkce({
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
  });

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12">
      <h1 className="text-2xl font-semibold">Authorize Open-Connect</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Paste an <code className="text-primary">oc_live_…</code> API key from your dashboard. Clients
        must use PKCE <code className="font-mono">S256</code>.
      </p>

      {error ? (
        <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error === "invalid_api_key"
            ? "That API key is invalid or revoked."
            : errorDescription || "Missing or invalid OAuth / PKCE parameters. Restart from your AI client."}
        </p>
      ) : null}

      {!pkcePreview.ok && !error ? (
        <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {pkcePreview.error_description}. Open this page from ChatGPT, Claude, or another OAuth client
          that sends <code className="font-mono">code_challenge</code> with method S256.
        </p>
      ) : null}

      <form method="post" action="/oauth/authorize" className="mt-6 space-y-4">
        <input type="hidden" name="redirect_uri" value={redirectUri} />
        <input type="hidden" name="client_id" value={clientId} />
        <input type="hidden" name="state" value={state} />
        <input type="hidden" name="scope" value={scope} />
        <input type="hidden" name="code_challenge" value={codeChallenge} />
        <input type="hidden" name="code_challenge_method" value={codeChallengeMethod || "S256"} />
        <label className="block text-sm font-medium">
          Open-Connect API key
          <input
            name="api_key"
            required
            autoComplete="off"
            placeholder="oc_live_…"
            disabled={!pkcePreview.ok && !error}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm disabled:opacity-50"
          />
        </label>
        <button
          type="submit"
          disabled={!pkcePreview.ok}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Allow access
        </button>
      </form>
      <p className="mt-4 text-xs text-muted-foreground">
        Client: {clientId || "unknown"}
        <br />
        PKCE: {codeChallengeMethod || "(missing)"} · challenge{" "}
        {codeChallenge ? `${codeChallenge.slice(0, 12)}…` : "(missing)"}
        <br />
        Redirect: {redirectUri || "missing — open this link from ChatGPT/Claude"}
      </p>
    </div>
  );
}
