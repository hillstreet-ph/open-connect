import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, Loader2, Pause, Play, RefreshCw, Trash2 } from "lucide-react";
import {
  createCloudBrowserMonitor,
  listCloudBrowserMonitors,
  updateCloudBrowserMonitor,
} from "@/lib/cloud-browser-workspace.functions";
import { MONITOR_SCHEDULES } from "@/lib/cloud-browser-sections";
import { ConfirmDelete } from "@/components/confirm-delete";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Page and topic monitors that re-check on a schedule (TinyFish Monitor). */
export function CloudBrowserMonitors() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listCloudBrowserMonitors);
  const createFn = useServerFn(createCloudBrowserMonitor);
  const updateFn = useServerFn(updateCloudBrowserMonitor);
  const [type, setType] = useState<"fetch" | "search">("fetch");
  const [target, setTarget] = useState("");
  const [name, setName] = useState("");
  const [purpose, setPurpose] = useState("");
  const [cron, setCron] = useState<string>(MONITOR_SCHEDULES[2].cron);

  const monitors = useQuery({
    queryKey: ["cloud-monitors"],
    queryFn: () => listFn(),
    retry: false,
  });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["cloud-monitors"] });
  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          type,
          ...(type === "fetch" ? { url: target.trim() } : { query: target.trim() }),
          ...(name.trim() ? { name: name.trim() } : {}),
          ...(purpose.trim() ? { purpose: purpose.trim() } : {}),
          schedule_cron: cron,
        },
      }),
    onSuccess: () => {
      setTarget("");
      setName("");
      setPurpose("");
      refresh();
    },
  });
  const update = useMutation({
    mutationFn: (input: { id: string; action: "pause" | "resume" | "run" | "delete" }) =>
      updateFn({ data: input }),
    onSuccess: refresh,
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="size-4" aria-hidden /> New monitor
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (target.trim()) create.mutate();
            }}
          >
            <fieldset className="flex gap-4 text-sm sm:col-span-2">
              <legend className="sr-only">Monitor type</legend>
              <label className="flex items-center gap-2">
                <input type="radio" checked={type === "fetch"} onChange={() => setType("fetch")} />
                Page (watch a URL)
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={type === "search"}
                  onChange={() => setType("search")}
                />
                Topic (watch search results)
              </label>
            </fieldset>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="monitor-target">
                {type === "fetch" ? "Page URL" : "Topic query"}
              </Label>
              <Input
                id="monitor-target"
                value={target}
                placeholder={
                  type === "fetch" ? "https://example.com/pricing" : "new electric vehicle policies"
                }
                onChange={(event) => setTarget(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="monitor-name">Name (optional)</Label>
              <Input
                id="monitor-name"
                maxLength={100}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="monitor-schedule">Schedule</Label>
              <select
                id="monitor-schedule"
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={cron}
                onChange={(event) => setCron(event.target.value)}
              >
                {MONITOR_SCHEDULES.map((item) => (
                  <option key={item.cron} value={item.cron}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="monitor-purpose">What change matters? (optional)</Label>
              <Input
                id="monitor-purpose"
                maxLength={2000}
                value={purpose}
                placeholder="e.g. The enterprise plan price changes"
                onChange={(event) => setPurpose(event.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={!target.trim() || create.isPending}>
                {create.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Create monitor
              </Button>
            </div>
            {create.isError ? (
              <p role="alert" className="text-sm text-destructive sm:col-span-2">
                {create.error.message}
              </p>
            ) : null}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your monitors</CardTitle>
        </CardHeader>
        <CardContent>
          {update.isError ? (
            <p role="alert" className="mb-3 text-sm text-destructive">
              {update.error.message}
            </p>
          ) : null}
          {monitors.isLoading ? (
            <p role="status">Loading monitors…</p>
          ) : monitors.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {monitors.error.message}
            </p>
          ) : monitors.data?.length ? (
            <ul className="space-y-3 text-sm">
              {monitors.data.map((monitor) => (
                <li key={monitor.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{monitor.name ?? monitor.target}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {monitor.type === "fetch" ? "Page" : "Topic"} · {monitor.target} ·{" "}
                        <code>{monitor.schedule_cron}</code>
                      </p>
                      {monitor.last_error ? (
                        <p className="text-xs text-destructive">{monitor.last_error}</p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={monitor.status === "active" ? "default" : "secondary"}>
                        {monitor.status}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={update.isPending}
                        onClick={() => update.mutate({ id: monitor.id, action: "run" })}
                      >
                        <RefreshCw className="mr-1 size-3.5" /> Run now
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={update.isPending}
                        onClick={() =>
                          update.mutate({
                            id: monitor.id,
                            action: monitor.status === "active" ? "pause" : "resume",
                          })
                        }
                      >
                        {monitor.status === "active" ? (
                          <Pause className="mr-1 size-3.5" />
                        ) : (
                          <Play className="mr-1 size-3.5" />
                        )}
                        {monitor.status === "active" ? "Pause" : "Resume"}
                      </Button>
                      <ConfirmDelete
                        title="Delete this monitor?"
                        description="Its schedule stops and it is removed from TinyFish. This cannot be undone."
                        onConfirm={() => update.mutate({ id: monitor.id, action: "delete" })}
                      >
                        <Button size="sm" variant="outline" className="text-destructive">
                          <Trash2 className="size-3.5" />
                          <span className="sr-only">Delete monitor</span>
                        </Button>
                      </ConfirmDelete>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No monitors yet.</p>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Run history and email alerts are in{" "}
            <a
              className="underline"
              href="https://agent.tinyfish.ai/monitor"
              target="_blank"
              rel="noopener noreferrer"
            >
              TinyFish Monitor
            </a>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
