import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Globe, Loader2, Maximize2, Square } from "lucide-react";
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
import { CloudBrowserProfiles } from "@/components/cloud-browser-profiles";
import { DirectCloudBrowser } from "@/components/direct-cloud-browser";
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
  profile_id?: string | null;
  requires_sign_in?: boolean;
};

const STATUS_STYLE: Record<string, string> = {
  RUNNING: "bg-destructive text-destructive-foreground",
  PENDING: "bg-warning text-warning-foreground",
  COMPLETED: "bg-success text-success-foreground",
  FAILED: "bg-muted-foreground text-background",
  CANCELLED: "bg-muted-foreground text-background",
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
  initialMode,
}: {
  runId?: string;
  initialMode?: "direct" | undefined;
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
  const [duration, setDuration] = useState(600);
  const [historySearch, setHistorySearch] = useState("");
  const [directActive, setDirectActive] = useState(false);
  const [mode, setMode] = useState<"agent" | "direct">(initialMode ?? "agent");

  const [lastInitialMode, setLastInitialMode] = useState(initialMode);
  if (lastInitialMode !== initialMode) {
    setLastInitialMode(initialMode);
    if (initialMode && !directActive) setMode(initialMode);
  }

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
          max_duration_seconds: duration,
          ...(profileId === "default" && overview.data?.connected && overview.data.defaultProfile
            ? { profile_id: overview.data.defaultProfile.id }
            : profileId !== "none" && profileId !== "default"
              ? { profile_id: profileId }
              : {}),
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

  const selectedProfile =
    profileId === "default"
      ? data.defaultProfile
      : data.profiles.find((profile) => profile.id === profileId);
  const active = run.data;
  const output = active ? renderResult(active.result) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>Browser connection · {data.connection.name}</span>
        <Button
          variant="outline"
          size="sm"
          disabled={overview.isFetching}
          onClick={() => void overview.refetch()}
        >
          Refresh profiles and sessions
        </Button>
      </div>
      {!data.profilesAvailable ? (
        <p role="alert">
          Saved profiles could not be loaded. Refresh or check your TinyFish connection before
          relying on saved sign-ins.
        </p>
      ) : null}
      {run.isError ? <p role="alert">Could not load this session: {run.error.message}</p> : null}
      {cancel.isError ? (
        <p role="alert">Could not stop this session: {cancel.error.message}</p>
      ) : null}
      <div className="flex flex-wrap gap-2" aria-label="Browser mode">
        <Button
          variant={mode === "agent" ? "default" : "outline"}
          disabled={directActive}
          onClick={() => setMode("agent")}
        >
          Agent tasks · read-only preview
        </Button>
        <Button
          variant={mode === "direct" ? "default" : "outline"}
          onClick={() => setMode("direct")}
        >
          Direct control · manual login
        </Button>
      </div>
      <div hidden={mode !== "direct"}>
        <DirectCloudBrowser
          onActiveChange={setDirectActive}
          profileId={profileId === "none" ? undefined : selectedProfile?.id}
          onSaved={() => {
            void queryClient.invalidateQueries({ queryKey: ["cloud-browser-overview"] });
            void queryClient.invalidateQueries({ queryKey: ["cloud-browser-profile"] });
          }}
        />
      </div>
      <div hidden={mode !== "agent"} className="space-y-6">
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
            <div
              className={
                active?.terminal && !active.video_url
                  ? "w-full bg-muted px-4 py-3"
                  : "aspect-[16/10] w-full bg-muted"
              }
            >
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
                    active.requires_sign_in ? (
                      "Sign-in required. Renew the saved login before retrying."
                    ) : (
                      "Run finished. The live view has closed; results are below."
                    )
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
              {active?.requires_sign_in ? (
                <div className="space-y-2 rounded-md border border-warning p-3">
                  <p>
                    This task reached a sign-in page. A completed diagnostic does not mean you are
                    authenticated.
                  </p>
                  <Button
                    size="sm"
                    onClick={() => {
                      if (active.profile_id) setProfileId(active.profile_id);
                      setMode("direct");
                    }}
                  >
                    Open manual login setup
                  </Button>
                </div>
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
              <div className="flex flex-wrap gap-2">
                {[
                  "Summarize this page",
                  "Compare products and report the differences",
                  "Check this website and report any problems",
                ].map((task) => (
                  <Button key={task} size="sm" variant="outline" onClick={() => setGoal(task)}>
                    {task}
                  </Button>
                ))}
              </div>
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
              <p className="text-xs text-muted-foreground">
                {profileId === "none"
                  ? "This task starts without saved sign-ins."
                  : "Uses the selected TinyFish Browser Context Profile. Saved cookies may expire and require signing in again."}
              </p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={stealth}
                  onChange={(event) => setStealth(event.target.checked)}
                />
                Stealth mode for bot-protected sites
              </label>
              {profileId !== "none" && !selectedProfile ? (
                <p role="status" className="text-sm text-muted-foreground">
                  Create a saved profile below, or choose Fresh browser to start without sign-ins.
                </p>
              ) : null}
              <Label htmlFor="cb-duration">Maximum task duration</Label>
              <select
                id="cb-duration"
                className="w-full rounded-md border bg-background p-2"
                value={duration}
                onChange={(event) => setDuration(Number(event.target.value))}
              >
                <option value={120}>2 minutes</option>
                <option value={600}>10 minutes</option>
                <option value={1800}>30 minutes</option>
                <option value={3600}>60 minutes</option>
              </select>
              <Button
                className="w-full"
                disabled={
                  start.isPending ||
                  !url.trim() ||
                  !goal.trim() ||
                  (profileId !== "none" && (!data.profilesAvailable || !selectedProfile))
                }
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
      </div>
      <CloudBrowserProfiles
        profileId={profileId === "none" ? undefined : selectedProfile?.id}
        onSelect={setProfileId}
      />

      <p className="text-xs text-muted-foreground">
        Browser tasks support navigation, clicks and forms through your goal. The live view shows
        the task in progress; it does not guarantee manual mouse or keyboard control. Raw CDP
        sessions are separate and must be closed when finished.
      </p>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent sessions</CardTitle>
        </CardHeader>
        <CardContent>
          <Label htmlFor="cb-history">Find a previous task</Label>
          <Input
            id="cb-history"
            className="mb-3 mt-2"
            placeholder="Search recent tasks"
            value={historySearch}
            onChange={(event) => setHistorySearch(event.target.value)}
          />
          {data.runs.filter((item) => item.goal.toLowerCase().includes(historySearch.toLowerCase()))
            .length ? (
            <ul className="divide-y rounded-md border">
              {data.runs
                .filter((item) => item.goal.toLowerCase().includes(historySearch.toLowerCase()))
                .map((item) => (
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
