import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { validateOAuthRequest } from "@/lib/oauth-policy";
export const Route = createFileRoute("/oauth/authorize")({
  ssr: false,
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  let request: ReturnType<typeof validateOAuthRequest> | undefined;
  let invalid = "";
  try {
    request = validateOAuthRequest(search);
  } catch (e) {
    invalid = e instanceof Error ? e.message : "Invalid request";
  }
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
          p_scopes: request.scope.split(" "),
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
      {invalid || error ? (
        <p role="alert" className="mt-4 text-destructive">
          {invalid || error}
        </p>
      ) : null}
      {request ? (
        <>
          <p className="mt-4 break-all text-sm">Client: {request.client_id}</p>
          <p className="break-all text-sm">Return to: {new URL(request.redirect_uri).origin}</p>
          <h2 className="mt-4 font-medium">Requested permissions</h2>
          <ul className="mb-4 list-disc pl-5 text-sm">
            {request.scope.split(" ").map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          {loading ? (
            <p>Checking sign-in…</p>
          ) : user ? (
            <>
              <p className="mb-3 text-sm">Signed in as {user.email}</p>
              <button
                disabled={busy}
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
