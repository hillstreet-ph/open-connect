import { useId, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  cancelCloudBrowserRun,
  getCloudBrowserOverview,
  getCloudBrowserRun,
  startCloudBrowserRun,
} from "@/lib/cloud-browser.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** Browser prompts go directly to the authorized provider, never to a workspace-only planner. */
export function BrowserAgentChat({
  runId,
  onSelectRun,
}: {
  runId?: string | undefined;
  onSelectRun: (id: string | undefined) => void;
}) {
  const id = useId();
  const [url, setUrl] = useState("");
  const [prompt, setPrompt] = useState("");
  const [profile, setProfile] = useState("none");
  const [duration, setDuration] = useState(300);
  const submitting = useRef(false);
  const queryClient = useQueryClient();
  const overviewFn = useServerFn(getCloudBrowserOverview);
  const startFn = useServerFn(startCloudBrowserRun);
  const statusFn = useServerFn(getCloudBrowserRun);
  const cancelFn = useServerFn(cancelCloudBrowserRun);
  const overview = useQuery({
    queryKey: ["cloud-browser-overview"],
    queryFn: () => overviewFn(),
    retry: false,
  });
  const run = useQuery({
    queryKey: ["cloud-browser-run", runId],
    queryFn: () => statusFn({ data: { runId: runId! } }),
    enabled: Boolean(runId),
    retry: 1,
    refetchInterval: (query) => (query.state.data?.terminal ? false : 3000),
  });
  const start = useMutation({
    retry: false,
    mutationFn: () =>
      startFn({
        data: {
          url: url.trim(),
          goal: prompt.trim(),
          use_profile: profile !== "none",
          ...(profile !== "none" ? { profile_id: profile } : {}),
          max_duration_seconds: duration,
        },
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(["cloud-browser-run", data.run_id], data);
      onSelectRun(data.run_id);
      void queryClient.invalidateQueries({ queryKey: ["cloud-browser-overview"] });
    },
  });
  const cancel = useMutation({
    retry: false,
    mutationFn: () => cancelFn({ data: { runId: runId! } }),
    onSuccess: () => void run.refetch(),
  });
  const active = Boolean(runId && !run.data?.terminal);
  const data = overview.data;
  const output = run.data?.result;
  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">
        Give the browser agent a website and a task. It navigates, clicks and types to complete your
        prompt through your TinyFish connection. Browser usage is metered separately from workspace
        AI replies. Keep passwords and verification codes out of the prompt.
      </p>
      {overview.isPending ? <p role="status">Checking browser connection…</p> : null}
      {overview.isError ? <p role="alert">{overview.error.message}</p> : null}
      {data?.connected === false ? (
        <p>
          Connect TinyFish in{" "}
          <Link className="underline" to="/connections">
            Connections
          </Link>{" "}
          to execute browser tasks.
        </p>
      ) : null}
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (submitting.current || active || !data?.connected) return;
          submitting.current = true;
          void start
            .mutateAsync()
            .catch(() => {})
            .finally(() => {
              submitting.current = false;
            });
        }}
      >
        <div className="space-y-1">
          <Label htmlFor={`${id}-url`}>Starting website</Label>
          <Input
            id={`${id}-url`}
            placeholder="https://example.com"
            value={url}
            maxLength={2048}
            onChange={(event) => setUrl(event.target.value)}
            disabled={active || start.isPending}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-profile`}>Browser profile</Label>
          <select
            id={`${id}-profile`}
            className="w-full rounded-md border bg-background px-3 py-2"
            value={profile}
            disabled={active || start.isPending}
            onChange={(event) => setProfile(event.target.value)}
          >
            <option value="none">Fresh browser · no saved sign-ins</option>
            {data?.connected
              ? data.profiles.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.is_default ? " · default" : ""}
                  </option>
                ))
              : null}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-prompt`}>What should the agent do?</Label>
          <Textarea
            id={`${id}-prompt`}
            value={prompt}
            maxLength={8000}
            rows={3}
            placeholder="Describe the outcome you want and any limits."
            disabled={active || start.isPending}
            onChange={(event) => setPrompt(event.target.value)}
            required
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor={`${id}-duration`}>Time limit</Label>
          <select
            id={`${id}-duration`}
            className="rounded-md border bg-background px-2 py-2"
            value={duration}
            disabled={active || start.isPending}
            onChange={(event) => setDuration(Number(event.target.value))}
          >
            <option value={60}>1 minute</option>
            <option value={300}>5 minutes</option>
            <option value={600}>10 minutes</option>
            <option value={1800}>30 minutes</option>
          </select>
          <Button
            type="submit"
            disabled={
              !data?.connected || !url.trim() || !prompt.trim() || active || start.isPending
            }
          >
            {start.isPending ? "Starting agent…" : "Execute browser task"}
          </Button>
        </div>
      </form>
      {start.isError ? (
        <div role="alert" className="space-y-1 text-destructive">
          <p>{start.error.message}</p>
          <p>
            Submission was not confirmed. Check recent runs before submitting again; a timed-out
            request may have started.
          </p>
        </div>
      ) : null}
      {runId ? (
        <section className="space-y-2 rounded-lg border p-3" aria-label="Browser task result">
          <p role="status" className="font-medium">
            {run.data?.status ?? "Checking task…"}
          </p>
          <p className="break-all text-xs text-muted-foreground">Run: {runId}</p>
          {run.data?.goal ? <p>{run.data.goal}</p> : null}
          {run.isError ? (
            <p role="alert">
              Status unavailable: {run.error.message}. The task may still be running. Retry status
              or open its browser view; do not submit it again.
            </p>
          ) : null}
          {run.data?.requires_sign_in ? (
            <p role="alert">
              Sign-in is required. Open Cloud Browser → Direct control, sign in, save the selected
              profile, then start a new task.
            </p>
          ) : null}
          {run.data?.error?.message ? (
            <p role="alert" className="text-destructive">
              {run.data.error.message}
            </p>
          ) : null}
          {output !== undefined && output !== null ? (
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 text-xs">
              {typeof output === "string" ? output : JSON.stringify(output, null, 2)}
            </pre>
          ) : null}
          {run.data?.terminal ? (
            <p className="text-xs text-muted-foreground">
              This run has ended. Review its output before relying on the outcome.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/cloud-browser" search={{ run: runId }}>
                Open browser view
              </Link>
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={run.isFetching}
              onClick={() => void run.refetch()}
            >
              Refresh status
            </Button>
            {active ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate()}
              >
                {cancel.isPending ? "Stopping…" : "Stop task"}
              </Button>
            ) : null}
            {run.data?.terminal ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  start.reset();
                  cancel.reset();
                  onSelectRun(undefined);
                }}
              >
                New task
              </Button>
            ) : null}
          </div>
          {cancel.isError ? (
            <p role="alert">Stop was not confirmed: {cancel.error.message}</p>
          ) : null}
        </section>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Closing this panel does not stop a task. Runs continue at the provider until completion,
        cancellation or their time limit.
      </p>
      <Link className="inline-block underline" to="/cloud-browser" search={{}}>
        Recent runs, live view and manual login
      </Link>
    </div>
  );
}
