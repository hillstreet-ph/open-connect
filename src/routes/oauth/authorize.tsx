import { oauthCallback } from "@/lib/mcp-oauth-contract";
import { scopesForProfile } from "@/lib/access-profiles";
import { useRoles } from "@/hooks/use-roles";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { withOAuthRequestTimeout } from "@/lib/oauth-consent";
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
    Object.fromEntries(
      Object.entries(s)
        .filter(([, v]) => typeof v === "string")
        .concat(
          s["resource"] !== undefined && typeof s["resource"] !== "string"
            ? [["resource", "invalid_resource"]]
            : [],
        ),
    ) as Record<string, string>,
  component: AuthorizePage,
});
function AuthorizePage() {
  const search = Route.useSearch();
  const { user, loading } = useAuth();
  const { isAdmin, loading: rolesLoading } = useRoles();
  const [access, setAccess] = useState<ConsentProfile>("requested");
  const [busy, setBusy] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!redirecting) return;
    const timer = setTimeout(() => {
      setError(
        "The client has not opened. Restart the connection from your client. Check that redirects are allowed in this browser.",
      );
      setBusy(false);
      setRedirecting(false);
      inFlight.current = false;
    }, 15_000);
    return () => clearTimeout(timer);
  }, [redirecting]);
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
    if (!request || !user || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const { data, error: failure } = await withOAuthRequestTimeout((signal) =>
        supabase
          .rpc(
            "oc_authorize_oauth_client_resource" as never,
            {
              p_resource: request.resource,
              p_client_id: request.client_id,
              p_redirect_uri: request.redirect_uri,
              p_challenge: request.code_challenge,
              p_scopes: consentScopes(access, request.scope, isAdmin),
            } as never,
          )
          .abortSignal(signal),
      );
      if (failure) throw new Error(failure.message);
      if (typeof data !== "string") throw new Error("Authorization failed.");
      setRedirecting(true);
      window.location.assign(oauthCallback(request.redirect_uri, request.state, { code: data }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Authorization failed.");
      setBusy(false);
      setRedirecting(false);
      inFlight.current = false;
    }
  }
  async function cancel() {
    if (!request || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const { data, error: failure } = await withOAuthRequestTimeout((signal) =>
        supabase
          .rpc(
            "oc_oauth_client_registered" as never,
            {
              p_client_id: request.client_id,
              p_redirect_uri: request.redirect_uri,
            } as never,
          )
          .abortSignal(signal),
      );
      if (failure || data !== true) {
        throw new Error("Unregistered client or callback. Restart from your client.");
      }
      setRedirecting(true);
      window.location.assign(
        oauthCallback(request.redirect_uri, request.state, { error: "access_denied" }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cancel. Restart from your client.");
      setBusy(false);
      setRedirecting(false);
      inFlight.current = false;
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
          <p className="mt-2 text-sm text-muted-foreground">
            Access profiles choose this client's API permissions. They do not change your account
            role or grant access to another user's projects. Credential access is metadata only;
            passwords and tokens are not returned through MCP.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Auto can discover tools and continue permitted routine actions. It does not approve
            OAuth consent or override required operation and provider confirmations.
          </p>
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
                {redirecting ? "Returning to client…" : busy ? "Connecting…" : "Allow access"}
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
          <button
            disabled={busy}
            className="mt-4 text-center text-sm underline"
            onClick={() => void cancel()}
          >
            Cancel
          </button>
        </>
      ) : null}
    </main>
  );
}
