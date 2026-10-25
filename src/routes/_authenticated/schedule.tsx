import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, Loader2, Pause, Play, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  createSchedule,
  listAutomations,
  listSchedules,
  setScheduleStatus,
} from "@/lib/ops.functions";
import { Link } from "@tanstack/react-router";
import { RECURRENCES, statusClass, statusLabel } from "@/lib/operations";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/schedule")({
  head: () => ({
    meta: [
      { title: "Schedule — Open-Connect" },
      {
        name: "description",
        content: "Scheduled runs for agents, jobs, and operational workflows.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SchedulePage,
});

function SchedulePage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const list = useServerFn(listSchedules);
  const listAutomation = useServerFn(listAutomations);
  const create = useServerFn(createSchedule);
  const setStatus = useServerFn(setScheduleStatus);

  const [mode, setMode] = useState("recurring");
  const [timezone, setTimezone] = useState("UTC");
  const [name, setName] = useState("");
  const [cron, setCron] = useState("0 * * * *");
  const [runAt, setRunAt] = useState("");
  const [automationId, setAutomationId] = useState("");

  const schedules = useQuery({
    queryKey: ["schedules", user?.id],
    queryFn: () => list({}),
    enabled: !!user,
    refetchInterval: 30000,
  });
  const automations = useQuery({
    queryKey: ["automations", user?.id],
    queryFn: () => listAutomation({}),
    enabled: !!user,
  });
  const runnableAutomations = (automations.data ?? []).filter(
    (item) => item.action_type === "model" && item.enabled,
  );

  const createMutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          name,
          cronExpr: mode === "recurring" ? cron || undefined : undefined,
          runAt: mode === "once" && runAt ? new Date(runAt).toISOString() : undefined,
          timezone,
          automationId,
        },
      }),
    onSuccess: () => {
      toast.success("Schedule created");
      setName("");
      setAutomationId("");
      void qc.invalidateQueries({ queryKey: ["schedules"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const toggleMutation = useMutation({
    mutationFn: (input: { id: string; status: "active" | "paused" }) => setStatus({ data: input }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["schedules"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <div>
        <Badge variant="outline" className="mb-2 border-primary/40 text-primary">
          <CalendarClock className="mr-1 size-3" /> Operations · Schedule
        </Badge>
        <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">Schedule</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Schedule an enabled AI response automation. The background runner checks every five
          minutes and routes through connected free models.
        </p>
      </div>

      <Card className="shadow-panel">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">New schedule</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2 sm:col-span-3">
            <Label htmlFor="sched-automation">AI response automation</Label>
            <select
              id="sched-automation"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={automationId}
              onChange={(event) => setAutomationId(event.target.value)}
            >
              <option value="">Choose an enabled automation</option>
              {runnableAutomations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            {runnableAutomations.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                <Link to="/automations" className="text-primary underline">
                  Create an enabled AI response automation
                </Link>{" "}
                first.
              </p>
            ) : null}
          </div>
          <div className="space-y-2 sm:col-span-3">
            <Label htmlFor="sched-name">Name</Label>
            <Input
              id="sched-name"
              maxLength={240}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Hourly connection health"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sched-mode">Repeat</Label>
            <select
              id="sched-mode"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              <option value="recurring">Recurring</option>
              <option value="once">One time</option>
            </select>
          </div>
          {mode === "recurring" ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="sched-preset">Suggestions</Label>
                <select
                  id="sched-preset"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={RECURRENCES.some((r) => r.value === cron) ? cron : "custom"}
                  onChange={(e) => {
                    if (e.target.value !== "custom") setCron(e.target.value);
                  }}
                >
                  <option value="custom">Custom cron</option>
                  {RECURRENCES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sched-cron">Cron expression</Label>
                <Input
                  id="sched-cron"
                  value={cron}
                  onChange={(e) => setCron(e.target.value)}
                  className="font-mono"
                />
              </div>
            </>
          ) : (
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="sched-runat">Run at (device local time)</Label>
              <Input
                id="sched-runat"
                type="datetime-local"
                value={runAt}
                onChange={(e) => setRunAt(e.target.value)}
              />
            </div>
          )}
          <div className="space-y-2 sm:col-span-3">
            <Label htmlFor="sched-timezone">Timezone for recurring schedules</Label>
            <Input
              id="sched-timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="Asia/Manila"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC")}
            >
              Use device timezone
            </Button>
            <p className="text-xs text-muted-foreground">
              Recurring times follow this IANA timezone, including daylight saving changes. One-time
              dates use your device's timezone. Background checks may run later than the requested
              minute.
            </p>
          </div>
          <div className="sm:col-span-3">
            <Button
              disabled={
                !name.trim() ||
                !automationId ||
                (mode === "once" ? !runAt : !cron.trim()) ||
                createMutation.isPending
              }
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Create schedule
            </Button>
          </div>
        </CardContent>
      </Card>

      {automations.isError ? (
        <p role="alert" className="text-sm">
          Could not load automations.{" "}
          <Button variant="link" onClick={() => void automations.refetch()}>
            Retry
          </Button>
        </p>
      ) : null}
      <div className="space-y-2">
        {schedules.isLoading ? <p role="status">Loading schedules…</p> : null}
        {schedules.isError ? (
          <p role="alert">
            Could not load schedules.{" "}
            <Button variant="link" onClick={() => void schedules.refetch()}>
              Retry
            </Button>
          </p>
        ) : null}
        {!schedules.isLoading && !schedules.isError && (schedules.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No schedules yet.</p>
        ) : (
          schedules.data?.map((s) => (
            <Card key={s.id} className="p-4 shadow-panel">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 [overflow-wrap:anywhere] font-medium">{s.name}</p>
                    <Badge variant="outline" className={statusClass(s.status)}>
                      {statusLabel(s.status)}
                    </Badge>
                  </div>
                  <p className="mt-1 break-words font-mono text-xs text-muted-foreground">
                    {s.cron_expr ?? (s.run_at ? new Date(s.run_at).toLocaleString() : "—")} ·{" "}
                    {s.timezone}
                    <br />
                    Next:{" "}
                    {s.next_run_at ? new Date(s.next_run_at).toLocaleString() : "No upcoming run"}
                    {s.last_run_at ? ` · Last: ${new Date(s.last_run_at).toLocaleString()}` : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={toggleMutation.isPending || s.status === "completed"}
                  onClick={() =>
                    toggleMutation.mutate({
                      id: s.id,
                      status: s.status === "active" ? "paused" : "active",
                    })
                  }
                >
                  {s.status === "active" ? (
                    <>
                      <Pause className="size-3.5" /> Pause
                    </>
                  ) : (
                    <>
                      <Play className="size-3.5" /> Activate
                    </>
                  )}
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
