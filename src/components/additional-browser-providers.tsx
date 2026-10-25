import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import {
  startAdditionalBrowser,
  readAdditionalBrowser,
  stopAdditionalBrowser,
} from "@/lib/browser-providers.functions";
import type { ProviderHandle } from "@/lib/browser-providers.server";
import { Button } from "@/components/ui/button";

export function AdditionalBrowserProviders() {
  const { user } = useAuth();
  return user ? <ProviderPanel key={user.id} userId={user.id} /> : null;
}
function ProviderPanel({ userId }: { userId: string }) {
  const storageKey = `oc-browser-provider:${userId}`;
  const [provider, setProvider] = useState<"browser_use" | "browserbase">("browser_use");
  const [task, setTask] = useState("");
  const [approved, setApproved] = useState(false);
  const [reference, setReference] = useState<ProviderHandle>();
  const [restored, setRestored] = useState(false);
  const [error, setError] = useState("");
  const [reconciled, setReconciled] = useState(false);
  const submitting = useRef(false);
  const startFn = useServerFn(startAdditionalBrowser),
    readFn = useServerFn(readAdditionalBrowser),
    stopFn = useServerFn(stopAdditionalBrowser);
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      try {
        const saved = sessionStorage.getItem(storageKey);
        if (saved) setReference(JSON.parse(saved));
      } catch {
        /* Storage may be disabled. */
      }
      setRestored(true);
    });
    return () => {
      cancelled = true;
    };
  }, [storageKey]);
  useEffect(() => {
    if (!restored) return;
    try {
      if (reference) sessionStorage.setItem(storageKey, JSON.stringify(reference));
      else sessionStorage.removeItem(storageKey);
    } catch {
      /* The run still exists in the provider dashboard. */
    }
  }, [reference, restored, storageKey]);
  const run = useQuery({
    queryKey: ["additional-browser", userId, reference],
    queryFn: () => readFn({ data: reference! }),
    enabled: Boolean(reference),
    retry: false,
    refetchInterval: (query) => (query.state.error || query.state.data?.terminal ? false : 5000),
  });
  const start = useMutation({
    retry: false,
    mutationFn: () =>
      startFn({ data: { provider, task: task || "Manual browser session", spendApproved: true } }),
    onSuccess: (data) => {
      setReference(data);
      setApproved(false);
    },
  });
  const stop = useMutation({
    retry: false,
    mutationFn: () => stopFn({ data: reference! }),
    onSuccess: () => void run.refetch(),
  });
  const live = run.data?.liveUrl;
  const safeLive = (() => {
    try {
      const url = new URL(live ?? "");
      return url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        !url.port &&
        ["browser-use.com", "browserbase.com"].some(
          (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
        )
        ? url.href
        : null;
    } catch {
      return null;
    }
  })();
  return (
    <section className="space-y-3 rounded-lg border p-4" aria-label="Additional browser providers">
      <h2 className="font-semibold">Browser Use and Browserbase</h2>
      <p className="text-sm text-muted-foreground">
        Connect your provider API key in{" "}
        <Link to="/connections" className="underline">
          Connections
        </Link>
        . Browser Use runs a prompt with a $1 cap. Browserbase opens a five-minute manual browser;
        it does not execute the prompt. Both use metered provider services.
      </p>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (submitting.current || reference || !approved || (start.isError && !reconciled))
            return;
          submitting.current = true;
          setError("");
          setReconciled(false);
          void start
            .mutateAsync()
            .catch(() =>
              setError(
                "Creation was not confirmed. Check the provider dashboard before creating another run; the request may have started.",
              ),
            )
            .finally(() => {
              submitting.current = false;
            });
        }}
      >
        <label className="block text-sm">
          Provider
          <select
            className="ml-3 rounded border bg-background p-2"
            disabled={Boolean(reference) || start.isPending}
            value={provider}
            onChange={(event) => setProvider(event.target.value as typeof provider)}
          >
            <option value="browser_use">Browser Use V4 agent</option>
            <option value="browserbase">Browserbase manual session</option>
          </select>
        </label>
        {provider === "browser_use" ? (
          <textarea
            aria-label="Browser Use task"
            required
            maxLength={8000}
            value={task}
            disabled={Boolean(reference) || start.isPending}
            onChange={(event) => setTask(event.target.value)}
            placeholder="Describe the website task and expected result. Keep passwords out of the prompt."
            className="min-h-24 w-full rounded border bg-background p-3 text-sm"
          />
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={approved}
            disabled={Boolean(reference) || start.isPending}
            onChange={(event) => setApproved(event.target.checked)}
          />
          I approve this metered run. Browser Use is capped at $1; Browserbase uses my plan’s
          browser-time rates.
        </label>
        <Button
          type="submit"
          disabled={
            Boolean(reference) || start.isPending || !approved || (start.isError && !reconciled)
          }
        >
          {start.isPending ? "Starting…" : "Start provider browser"}
        </Button>
      </form>
      {error || start.error ? (
        <p role="alert" className="text-sm text-destructive">
          {error} {start.error?.message}
        </p>
      ) : null}
      {start.isError || (reference && (!run.data?.terminal || !run.data.cleanupConfirmed)) ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={reconciled}
            onChange={(event) => setReconciled(event.target.checked)}
          />
          I checked the provider dashboard and confirmed that this run/browser is stopped or was
          never created.
        </label>
      ) : null}
      {reference ? (
        <div className="space-y-2 text-sm">
          <p className="break-all">
            {reference.provider} · {reference.id} · {run.data?.status ?? "Checking status…"}
          </p>
          {run.error ? (
            <p role="alert">
              Status unavailable. {run.error.message} Check the provider dashboard before abandoning
              this run.
            </p>
          ) : null}
          {safeLive ? (
            <a
              href={safeLive}
              target="_blank"
              rel="noopener noreferrer"
              className="block underline"
            >
              Open live browser
            </a>
          ) : null}
          <a
            href={
              reference.provider === "browserbase"
                ? `https://www.browserbase.com/sessions/${reference.id}`
                : "https://cloud.browser-use.com"
            }
            target="_blank"
            rel="noopener noreferrer"
            className="block underline"
          >
            Open provider dashboard / replay
          </a>
          {run.data?.result ? (
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-muted p-3">
              {typeof run.data.result === "string"
                ? run.data.result
                : JSON.stringify(run.data.result, null, 2)}
            </pre>
          ) : null}
          {run.data?.terminal ? (
            <p>
              {run.data.success
                ? "Task completed with a result. Review it against your goal."
                : "Provider session ended; a successful task result was not verified."}{" "}
              {run.data.cleanupConfirmed
                ? "Browser cleanup confirmed."
                : "Browser cleanup is not confirmed; check the provider dashboard."}
            </p>
          ) : null}
          {run.data?.error ? <p role="alert">{run.data.error}</p> : null}
          {run.data?.costUsd ? <p>Reported run cost: ${run.data.costUsd}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={stop.isPending || Boolean(run.data?.terminal && run.data.cleanupConfirmed)}
              onClick={() => stop.mutate()}
            >
              Stop / cancel
            </Button>
            <Button variant="outline" onClick={() => void run.refetch()}>
              Refresh
            </Button>
            <Button
              variant="outline"
              disabled={(!run.data?.terminal || !run.data.cleanupConfirmed) && !reconciled}
              onClick={() => setReference(undefined)}
            >
              New run
            </Button>
          </div>
          {stop.error ? <p role="alert">Stop was not confirmed. {stop.error.message}</p> : null}
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Closing this page does not cancel a run. The signed run reference survives reloads in this
        tab. Stop abandoned runs; unknown creates must be reconciled in the provider dashboard. No
        automatic top-ups or paid test runs are enabled.
      </p>
    </section>
  );
}
