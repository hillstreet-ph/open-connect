import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import {
  getGlobalBrowserAutomation,
  configureGlobalBrowserAutomation,
} from "@/lib/browser-verification.functions";
import { Button } from "./ui/button";

export function GlobalBrowserAutomation() {
  const { user } = useAuth();
  const read = useServerFn(getGlobalBrowserAutomation);
  const save = useServerFn(configureGlobalBrowserAutomation);
  const cache = useQueryClient();
  const status = useQuery({
    queryKey: ["global-browser-automation", user?.id],
    queryFn: () => read(),
    enabled: !!user,
  });
  const [draft, setDraft] = useState<{
    native_assistance: boolean;
    external_assistance: boolean;
  } | null>(null);
  const preferences = draft ??
    status.data?.preferences ?? { native_assistance: false, external_assistance: false };
  const native = preferences.native_assistance,
    external = preferences.external_assistance;
  const update = useMutation({
    mutationFn: () => save({ data: { native_assistance: native, external_assistance: external } }),
    onSuccess: () => cache.invalidateQueries({ queryKey: ["global-browser-automation", user?.id] }),
    retry: false,
  });
  return (
    <section
      id="browser-automation"
      className="space-y-4 rounded-xl border bg-card p-4 sm:p-5"
      aria-labelledby="browser-automation-title"
    >
      <div>
        <h2 id="browser-automation-title" className="font-semibold">
          Global browser automation
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          One verification policy for your browsers and authorized AI clients. Providers retain
          their own supported controls and sessions.
        </p>
      </div>
      {status.isPending ? (
        <p role="status" className="text-sm">
          Loading global settings…
        </p>
      ) : status.isError ? (
        <p role="alert">
          Global settings could not be loaded.{" "}
          <Button variant="link" onClick={() => void status.refetch()}>
            Retry
          </Button>
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
              <input
                className="mt-1"
                type="checkbox"
                checked={native}
                disabled={update.isPending}
                onChange={(e) => setDraft({ ...preferences, native_assistance: e.target.checked })}
              />
              <span>
                <span className="block font-medium">Request native assistance</span>
                <span className="text-xs text-muted-foreground">
                  Automatically request optional provider solving for new eligible sessions. Browser
                  Use agent runs manage their own built-in solver.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
              <input
                className="mt-1"
                type="checkbox"
                checked={external}
                disabled={update.isPending}
                onChange={(e) =>
                  setDraft({ ...preferences, external_assistance: e.target.checked })
                }
              />
              <span>
                <span className="block font-medium">Allow shared external resolver</span>
                <span className="text-xs text-muted-foreground">
                  Allow metered 2Captcha requests for supported widgets. Applies to direct browsers
                  and compatible AI/browser clients; account charges may apply.
                </span>
              </span>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" disabled={update.isPending} onClick={() => update.mutate()}>
              {update.isPending ? "Saving…" : "Save global policy"}
            </Button>
            <span className="text-xs text-muted-foreground">
              External resolver:{" "}
              {status.data?.external.credential_state === "saved"
                ? "key saved · live solving not yet verified"
                : status.data?.external.credential_state === "ambiguous"
                  ? "multiple keys · choose one canonical credential"
                  : "API key needed"}
            </span>
            <Button variant="link" size="sm" asChild>
              <Link to="/secrets">Credentials</Link>
            </Button>
          </div>
          {status.data?.external.credential_state === "missing" ? (
            <p className="text-sm text-muted-foreground">
              To activate the shared resolver, save one 2Captcha API key in Credentials with website
              https://2captcha.com. No solver account is currently configured.
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Shared widget types: reCAPTCHA v2 and Turnstile. Proofs stay bound to the same browser
            reference and page origin. A returned proof does not confirm website acceptance.
            Unresolved challenges, sign-in and MFA continue through that session’s normal handoff.
          </p>
        </>
      )}
      {update.isSuccess ? (
        <p role="status" className="text-sm">
          Global policy saved.
        </p>
      ) : null}
      {update.isError ? <p role="alert">Global policy could not be saved.</p> : null}
    </section>
  );
}
