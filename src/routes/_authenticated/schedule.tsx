import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, Loader2, Pause, Play, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { createSchedule, listSchedules, setScheduleStatus } from "@/lib/ops.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/schedule")({
  head: () => ({
    meta: [
      { title: "Schedule — Open-Connect" },
      { name: "description", content: "Scheduled runs for agents, jobs, and operational workflows." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SchedulePage,
});

function SchedulePage() {
  const qc = useQueryClient();
  const list = useServerFn(listSchedules);
  const create = useServerFn(createSchedule);
  const setStatus = useServerFn(setScheduleStatus);

  const [name, setName] = useState("");
  const [cron, setCron] = useState("0 * * * *");
  const [runAt, setRunAt] = useState("");

  const schedules = useQuery({ queryKey: ["schedules"], queryFn: () => list({}) });

  const createMutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          name,
          cronExpr: cron || undefined,
          runAt: runAt ? new Date(runAt).toISOString() : undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Schedule created");
      setName("");
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
          Cron or one-shot run times for maintenance, agent jobs, and syncs.
        </p>
      </div>

      <Card className="shadow-panel">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">New schedule</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2 sm:col-span-3">
            <Label htmlFor="sched-name">Name</Label>
            <Input
              id="sched-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Hourly connection health"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sched-cron">Cron (optional)</Label>
            <Input
              id="sched-cron"
              value={cron}
              onChange={(e) => setCron(e.target.value)}
              placeholder="0 * * * *"
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="sched-runat">Or run at (optional)</Label>
            <Input
              id="sched-runat"
              type="datetime-local"
              value={runAt}
              onChange={(e) => setRunAt(e.target.value)}
            />
          </div>
          <div className="sm:col-span-3">
            <Button
              disabled={!name.trim() || createMutation.isPending}
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

      <div className="space-y-2">
        {(schedules.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No schedules yet.</p>
        ) : (
          schedules.data?.map((s) => (
            <Card key={s.id} className="p-4 shadow-panel">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{s.name}</p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">
                    {s.cron_expr ?? s.run_at ?? "—"} · {s.status} · {s.timezone}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
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
