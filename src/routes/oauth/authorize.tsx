import { scopesForProfile } from "@/lib/access-profiles";
import { useRoles } from "@/hooks/use-roles";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { consentScopes, validateOAuthRequest, type ConsentProfile } from "@/lib/oauth-policy";
export const Route = createFileRoute("/oauth/authorize")({
  ssr: true,
  pendingComponent: () => (
    <p role="status" className="mx-auto max-w-md px-4 py-12">
      Loading Open-Connect authorization…
    </p>
  ),
  validateSearch: (s: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(s).filter(([, v]) => typeof v === "string")) as Record<
      string,
      string
    >,
  component: AuthorizePage,
});
function AuthorizePage() {
  const search = Route.useSearch();
  const { user, loading } = useAuth();
  const { isAdmin, loading: rolesLoading } = useRoles();
  const [access, setAccess] = useState<ConsentProfile>("requested");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  let request: ReturnType<typeof validateOAuthRequest> | undefined;
  let invalid = "";
  try {
    request = validateOAuthRequest(search);
  } catch (e) {
    invalid = e instanceof Error ? e.message : "Invalid request";
  }
  const grantedScopes =
    access === "requested" ? (request?.scope.split(" ") ?? []) : scopesForProfile(access);
  const needsAdmin = grantedScopes.includes("control:write") && !isAdmin;
  async function consent() {
    if (!request || !user) return;
    setBusy(true);
    setError("");
    try {
      const { data, error: failure } = await supabase.rpc(
        "oc_authorize_oauth_client" as never,
        {
          p_client_id: request.client_id,
          p_redirect_uri: request.redirect_uri,
          p_challenge: request.code_challenge,
          p_scopes: consentScopes(access, request.scope, isAdmin),
        } as never,
      );
      if (failure) throw new Error(failure.message);
      if (typeof data !== "string") throw new Error("Authorization failed.");
      const callback = new URL(request.redirect_uri);
      callback.searchParams.set("code", data);
      if (request.state) callback.searchParams.set("state", request.state);
      window.location.assign(callback.href);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Authorization failed.");
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12">
      <img
        src="/open-connect-mark.svg"
        alt="Open Connect"
        className="mb-5 size-24 object-contain"
      />
      <h1 className="text-2xl font-semibold">Connect to Open-Connect</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Sign in and approve access. No API key is required.
      </p>
      <noscript>
        <p role="alert" className="mt-4">
          JavaScript is required to sign in and approve this connection. Enable it, then reload this
          page or restart the connection from Composio.
        </p>
      </noscript>
      {invalid || error ? (
        <p role="alert" className="mt-4 text-destructive">
          {invalid || error}
        </p>
      ) : null}
      {request ? (
        <>
          <p className="mt-4 break-all text-sm">Client: {request.client_id}</p>
          <p className="break-all text-sm">Return to: {new URL(request.redirect_uri).origin}</p>
          {user && !rolesLoading ? (
            <label className="mt-4 flex flex-col gap-2 text-sm">
              Access profile
              <select
                className="rounded-md border bg-background p-2"
                value={access}
                disabled={busy}
                onChange={(event) => {
                  setAccess(event.target.value as ConsentProfile);
                  setError("");
                }}
              >
                <option value="requested">Permissions requested by this client</option>
                <option value="read_only">Read only — browse resources and account metadata</option>
                <option value="builder">Builder — create resources and run tools</option>
                <option value="developer">
                  Developer — builder access and credential metadata
                </option>
                {isAdmin ? (
                  <option value="administrator">
                    Administrator — all Open-Connect permissions
                  </option>
                ) : null}
              </select>
            </label>
          ) : null}
          <h2 className="mt-4 font-medium">Permissions to allow</h2>
          <ul className="mb-4 list-disc pl-5 text-sm">
            {grantedScopes.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          {grantedScopes.includes("control:write") ? (
            <p className="mb-4 text-sm">
              Administrator access lets this client configure connections and request control
              operations. An Admin account is required. Provider permissions and operation approval
              rules still apply.
            </p>
          ) : null}
          {loading ? (
            <p>Checking sign-in…</p>
          ) : user ? (
            <>
              <p className="mb-3 text-sm">Signed in as {user.email}</p>
              {!rolesLoading && needsAdmin ? (
                <p role="alert" className="mb-3 text-sm text-destructive">
                  These permissions require an Admin account. Choose another access profile or sign
                  in with your Admin account.
                </p>
              ) : null}
              <button
                disabled={busy || rolesLoading || needsAdmin}
                onClick={() => void consent()}
                className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
              >
                {busy ? "Connecting…" : "Allow access"}
              </button>
              <p className="mt-3 text-xs">
                Access expires after 30 days. Revoke it from API keys & MCP.
              </p>
            </>
          ) : (
            <a
              className="rounded-md bg-primary px-4 py-2 text-center text-primary-foreground"
              href={`/auth?returnTo=${encodeURIComponent("/oauth/authorize?" + new URLSearchParams(search))}`}
            >
              Sign in to continue
            </a>
          )}
          <a className="mt-4 text-center text-sm underline" href="/dashboard">
            Cancel
          </a>
        </>
      ) : null}
    </main>
  );
}
