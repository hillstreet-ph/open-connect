import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Circle, Loader2, ListTodo, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { listProjects } from "@/lib/orgs.functions";
import { createTask, listTasks, updateTaskStatus, type TaskStatus } from "@/lib/ops.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks — Open-Connect" },
      { name: "description", content: "Operational tasks for agents and workspace projects." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TasksPage,
});

const STATUSES: TaskStatus[] = ["todo", "in_progress", "blocked", "done", "cancelled"];

function TasksPage() {
  const qc = useQueryClient();
  const list = useServerFn(listTasks);
  const create = useServerFn(createTask);
  const update = useServerFn(updateTaskStatus);
  const listProj = useServerFn(listProjects);

  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");

  const tasks = useQuery({ queryKey: ["tasks"], queryFn: () => list({}) });
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => listProj({}) });

  const createMutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          title,
          projectId: projectId || undefined,
          priority,
        },
      }),
    onSuccess: () => {
      toast.success("Task created");
      setTitle("");
      void qc.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const statusMutation = useMutation({
    mutationFn: (input: { id: string; status: TaskStatus }) => update({ data: input }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["tasks"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <div>
        <Badge variant="outline" className="mb-2 border-primary/40 text-primary">
          <ListTodo className="mr-1 size-3" /> Operations · Tasks
        </Badge>
        <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">Tasks</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track work items for agents, rollouts, and operational follow-ups.
        </p>
      </div>

      <Card className="shadow-panel">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">New task</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Wire Open WebUI to /v1"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-project">Project</Label>
            <select
              id="task-project"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">None</option>
              {(projects.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-priority">Priority</Label>
            <select
              id="task-priority"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={priority}
              onChange={(e) => setPriority(e.target.value as typeof priority)}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div className="sm:col-span-4">
            <Button
              disabled={!title.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Add task
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {(tasks.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No tasks yet.</p>
        ) : (
          tasks.data?.map((t) => (
            <Card key={t.id} className="p-4 shadow-panel">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {t.status === "done" ? (
                      <CheckCircle2 className="size-4 text-primary" />
                    ) : (
                      <Circle className="size-4 text-muted-foreground" />
                    )}
                    <p className="font-medium">{t.title}</p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {(t as { projects?: { name?: string } }).projects?.name ?? "No project"} ·{" "}
                    {t.priority} · {t.status}
                  </p>
                </div>
                <select
                  className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                  value={t.status}
                  onChange={(e) =>
                    statusMutation.mutate({ id: t.id, status: e.target.value as TaskStatus })
                  }
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
