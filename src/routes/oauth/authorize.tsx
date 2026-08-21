import { createFileRoute } from "@tanstack/react-router";
import { createAuthCode } from "@/lib/oauth.server";
import { hashKey, KEY_PREFIX } from "@/lib/gateway.server";

export const Route = createFileRoute("/oauth/authorize")({
  ssr: true,
  validateSearch: (search: Record<string, unknown>) => ({
    response_type: typeof search['response_type'] === "string" ? search['response_type'] : undefined,
    client_id: typeof search['client_id'] === "string" ? search['client_id'] : undefined,
    redirect_uri: typeof search['redirect_uri'] === "string" ? search['redirect_uri'] : undefined,
    state: typeof search['state'] === "string" ? search['state'] : undefined,
    scope: typeof search['scope'] === "string" ? search['scope'] : undefined,
    code_challenge: typeof search['code_challenge'] === "string" ? search['code_challenge'] : undefined,
    code_challenge_method:
      typeof search['code_challenge_method'] === "string" ? search['code_challenge_method'] : undefined,
    error: typeof search['error'] === "string" ? search['error'] : undefined,
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
        const codeChallengeMethod = String(form.get("code_challenge_method") ?? "S256");

        if (!apiKey.startsWith(KEY_PREFIX) || !redirectUri || !codeChallenge) {
          return new Response(null, {
            status: 302,
            headers: {
              Location: `/oauth/authorize?error=invalid_request&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`,
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
          return new Response(null, {
            status: 302,
            headers: {
              Location: `/oauth/authorize?error=invalid_api_key&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}&code_challenge=${encodeURIComponent(codeChallenge)}&code_challenge_method=${encodeURIComponent(codeChallengeMethod)}&scope=${encodeURIComponent(scope)}`,
            },
          });
        }

        const code = createAuthCode({
          key: apiKey,
          redirect_uri: redirectUri,
          client_id: clientId,
          code_challenge: codeChallenge,
          code_challenge_method: codeChallengeMethod,
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
  const redirectUri = search['redirect_uri'] ?? "";
  const clientId = search['client_id'] ?? "mcp-client";
  const state = search['state'] ?? "";
  const scope = search['scope'] ?? "mcp:connect models:read models:invoke resources:read";
  const codeChallenge = search['code_challenge'] ?? "";
  const codeChallengeMethod = search['code_challenge_method'] ?? "S256";
  const error = search['error'];

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12">
      <h1 className="text-2xl font-semibold">Authorize Open-Connect</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Paste an <code className="text-primary">oc_live_…</code> API key from your dashboard. ChatGPT,
        Claude, and other agents will use it as a Bearer token — never share provider secrets.
      </p>
      {error ? (
        <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error === "invalid_api_key"
            ? "That API key is invalid or revoked."
            : "Missing OAuth parameters. Restart the connection from your AI client."}
        </p>
      ) : null}
      <form method="post" action="/oauth/authorize" className="mt-6 space-y-4">
        <input type="hidden" name="redirect_uri" value={redirectUri} />
        <input type="hidden" name="client_id" value={clientId} />
        <input type="hidden" name="state" value={state} />
        <input type="hidden" name="scope" value={scope} />
        <input type="hidden" name="code_challenge" value={codeChallenge} />
        <input type="hidden" name="code_challenge_method" value={codeChallengeMethod} />
        <label className="block text-sm font-medium">
          Open-Connect API key
          <input
            name="api_key"
            required
            autoComplete="off"
            placeholder="oc_live_…"
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Allow access
        </button>
      </form>
      <p className="mt-4 text-xs text-muted-foreground">
        Client: {clientId || "unknown"}
        <br />
        Redirect: {redirectUri || "missing — open this link from ChatGPT/Claude"}
      </p>
    </div>
  );
}
