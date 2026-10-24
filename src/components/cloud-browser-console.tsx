import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Globe, Loader2, Maximize2, Square } from "lucide-react";
import {
  cancelCloudBrowserRun,
  getCloudBrowserOverview,
  getCloudBrowserRun,
  startCloudBrowserRun,
} from "@/lib/cloud-browser.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type RunView = {
  run_id: string;
  status: string;
  goal?: string;
  streaming_url: string | null;
  video_url?: string | null;
  result?: unknown;
  error?: { message?: string } | null;
  terminal: boolean;
  steps?: number | null;
  created_at?: string;
  recent_actions?: string[];
};

const STATUS_STYLE: Record<string, string> = {
  RUNNING: "bg-red-600 text-white",
  PENDING: "bg-amber-500 text-black",
  COMPLETED: "bg-emerald-600 text-white",
  FAILED: "bg-zinc-600 text-white",
  CANCELLED: "bg-zinc-500 text-white",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[status] ?? "bg-muted"}`}
    >
      {status === "RUNNING" ? (
        <span className="size-2 animate-pulse rounded-full bg-white" />
      ) : null}
      {status === "RUNNING" ? "LIVE" : status}
    </span>
  );
}

function renderResult(result: unknown) {
  if (result === null || result === undefined) return null;
  const value =
    typeof result === "object" && result && "result" in result
      ? (result as { result: unknown }).result
      : result;
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

export function CloudBrowserConsole({
  runId,
  onSelectRun,
}: {
  runId?: string;
  onSelectRun: (runId: string | undefined) => void;
}) {
  const queryClient = useQueryClient();
  const overviewFn = useServerFn(getCloudBrowserOverview);
  const startFn = useServerFn(startCloudBrowserRun);
  const runFn = useServerFn(getCloudBrowserRun);
  const cancelFn = useServerFn(cancelCloudBrowserRun);
  const [url, setUrl] = useState("");
  const [goal, setGoal] = useState("");
  const [profileId, setProfileId] = useState("default");
  const [stealth, setStealth] = useState(false);

  const overview = useQuery({
    queryKey: ["cloud-browser-overview"],
    queryFn: () => overviewFn(),
    refetchInterval: 15_000,
    retry: false,
  });
  const run = useQuery({
    queryKey: ["cloud-browser-run", runId],
    queryFn: () => runFn({ data: { runId: runId! } }) as Promise<RunView>,
    enabled: Boolean(runId),
    refetchInterval: (query) => (query.state.data?.terminal ? false : 3000),
    retry: 1,
  });
  const start = useMutation({
    mutationFn: () =>
      startFn({
        data: {
          url,
          goal,
          use_profile: profileId !== "none",
          stealth,
          ...(profileId !== "none" && profileId !== "default" ? { profile_id: profileId } : {}),
        },
      }) as Promise<RunView>,
    onSuccess: (data) => {
      queryClient.setQueryData(["cloud-browser-run", data.run_id], data);
      onSelectRun(data.run_id);
      void queryClient.invalidateQueries({ queryKey: ["cloud-browser-overview"] });
    },
  });
  const cancel = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { runId: id } }),
    onSuccess: () => void run.refetch(),
  });

  useEffect(() => {
    if (run.data?.terminal)
      void queryClient.invalidateQueries({ queryKey: ["cloud-browser-overview"] });
  }, [run.data?.terminal, queryClient]);

  if (overview.isLoading) return <p role="status">Loading cloud browser…</p>;
  if (overview.isError)
    return <p role="alert">Cloud browser unavailable: {overview.error.message}</p>;
  const data = overview.data!;
  if (!data.connected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connect your cloud browser</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Open-Connect drives a real cloud Chrome through TinyFish, reusing your saved sign-ins
            (Browser Context Profile). One API key powers this page and every AI agent connected to
            open-connect.site/mcp.
          </p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Create an API key at{" "}
              <a
                className="underline"
                href="https://agent.tinyfish.ai/api-keys"
                target="_blank"
                rel="noopener noreferrer"
              >
                agent.tinyfish.ai/api-keys
              </a>
              .
            </li>
            <li>Add it in Connections → TinyFish Cloud Browser.</li>
          </ol>
          <Button asChild>
            <Link to="/connections">Open Connections</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const active = run.data;
  const output = active ? renderResult(active.result) : null;

  return (
    <div className="space-y-6">
      {runId ? (
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            {active ? (
              <StatusBadge status={active.status} />
            ) : (
              <Loader2 className="size-4 animate-spin" />
            )}
            <p className="min-w-0 flex-1 truncate text-sm" title={active?.goal}>
              {active?.goal ?? "Starting…"}
            </p>
            {active?.streaming_url && !active.terminal ? (
              <Button asChild size="icon" variant="ghost" aria-label="Open live view full screen">
                <a href={active.streaming_url} target="_blank" rel="noopener noreferrer">
                  <Maximize2 className="size-4" />
                </a>
              </Button>
            ) : null}
            {active && !active.terminal ? (
              <Button
                size="sm"
                variant="outline"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate(active.run_id)}
              >
                <Square className="size-3" /> Stop
              </Button>
            ) : null}
          </div>
          <div className="aspect-[16/10] w-full bg-muted">
            {active?.streaming_url && !active.terminal ? (
              <iframe
                title="Live cloud browser"
                src={active.streaming_url}
                className="size-full"
                allow="clipboard-read; clipboard-write; fullscreen"
                referrerPolicy="no-referrer"
              />
            ) : active?.terminal && active.video_url ? (
              <video src={active.video_url} controls className="size-full" />
            ) : (
              <div className="flex size-full items-center justify-center gap-2 text-sm text-muted-foreground">
                {active?.terminal ? (
                  "Session ended."
                ) : (
                  <>
                    <Loader2 className="size-4 animate-spin" /> Waiting for the live browser…
                  </>
                )}
              </div>
            )}
          </div>
          <CardContent className="space-y-2 pt-3 text-sm">
            {active?.recent_actions?.length && !active.terminal ? (
              <p className="text-muted-foreground">
                Step {active.steps ?? active.recent_actions.length}:{" "}
                {active.recent_actions[active.recent_actions.length - 1]}
              </p>
            ) : null}
            {active?.error?.message ? <p role="alert">{active.error.message}</p> : null}
            {output ? (
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
                {output}
              </pre>
            ) : null}
            <Button variant="ghost" size="sm" onClick={() => onSelectRun(undefined)}>
              New task
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New cloud browser task</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label htmlFor="cb-url">Start at</Label>
            <Input
              id="cb-url"
              inputMode="url"
              placeholder="https://web.telegram.org"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
            <Label htmlFor="cb-goal">Goal</Label>
            <Textarea
              id="cb-goal"
              className="min-h-24"
              placeholder="Check if t.me/example is accessible and report what you see."
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
            />
            <Label htmlFor="cb-profile">Saved sign-ins</Label>
            <select
              id="cb-profile"
              className="w-full rounded-md border bg-background p-2"
              value={profileId}
              onChange={(event) => setProfileId(event.target.value)}
            >
              <option value="default">
                Default profile{data.defaultProfile ? ` · ${data.defaultProfile.name}` : ""}
              </option>
              {data.profiles
                .filter((profile) => !profile.is_default)
                .map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name} · {profile.domain_count} sites
                  </option>
                ))}
              <option value="none">Fresh browser (no saved sign-ins)</option>
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={stealth}
                onChange={(event) => setStealth(event.target.checked)}
              />
              Stealth mode for bot-protected sites
            </label>
            <Button
              className="w-full"
              disabled={start.isPending || !url.trim() || !goal.trim()}
              onClick={() => start.mutate()}
            >
              {start.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Globe className="size-4" />
              )}
              {start.isPending ? "Starting cloud browser…" : "Run in cloud browser"}
            </Button>
            {start.isError ? <p role="alert">{start.error.message}</p> : null}
          </CardContent>
        </Card>
      )}

      {data.defaultProfile ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Saved sites · {data.defaultProfile.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.defaultProfile.domains.length ? (
              <ul className="divide-y rounded-md border">
                {data.defaultProfile.domains.map((domain) => (
                  <li key={domain.domain} className="flex items-center justify-between px-3 py-2">
                    <span>{domain.domain}</span>
                    <span className="text-muted-foreground">{domain.cookies} cookies</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">No saved sites yet.</p>
            )}
            <a
              className="inline-flex items-center gap-1 underline"
              href={`https://agent.tinyfish.ai/profiles/${encodeURIComponent(data.defaultProfile.id)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Add sign-ins or import cookies <ExternalLink className="size-3" />
            </a>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent sessions</CardTitle>
        </CardHeader>
        <CardContent>
          {data.runs.length ? (
            <ul className="divide-y rounded-md border">
              {data.runs.map((item) => (
                <li key={item.run_id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                    onClick={() => onSelectRun(item.run_id)}
                  >
                    <StatusBadge status={item.status} />
                    <span className="min-w-0 flex-1 truncate">{item.goal}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {new Date(item.created_at).toLocaleString()}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Tasks you or your AI agents start appear here with a live view.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
