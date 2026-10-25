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
import { WorkTemplatePicker } from "@/components/work-template-picker";
import { statusClass, statusLabel, TASK_STATUSES } from "@/lib/operations";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
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

const STATUSES = TASK_STATUSES;

function TasksPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const list = useServerFn(listTasks);
  const create = useServerFn(createTask);
  const update = useServerFn(updateTaskStatus);
  const listProj = useServerFn(listProjects);

  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [filter, setFilter] = useState("all");
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");

  const tasks = useQuery({
    queryKey: ["tasks", user?.id, filter],
    queryFn: () => list({ data: { status: filter === "all" ? undefined : filter } }),
    enabled: !!user,
    refetchInterval: 30000,
  });
  const projects = useQuery({
    queryKey: ["projects", user?.id],
    queryFn: () => listProj({}),
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          title,
          description,
          dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
          projectId: projectId || undefined,
          priority,
        },
      }),
    onSuccess: () => {
      toast.success("Task created");
      setTitle("");
      setDescription("");
      setDueAt("");
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

      <WorkTemplatePicker
        kind="task"
        draft={{ title, description, priority }}
        onSelect={(t) => {
          setTitle(t.title);
          setDescription(t.description);
          setPriority(t.priority);
        }}
      />
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
              maxLength={240}
              placeholder="What needs to be done?"
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
          <div className="space-y-2 sm:col-span-3">
            <Label htmlFor="task-description">Details</Label>
            <Textarea
              id="task-description"
              maxLength={8000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Context, checklist, or expected result"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-due">Due date (your local time)</Label>
            <Input
              id="task-due"
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
            />
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">
          Your tasks <span className="text-muted-foreground">· {tasks.data?.length ?? 0}</span>
        </h2>
        <select
          aria-label="Filter tasks by status"
          className="h-9 rounded-md border bg-background px-3 text-sm"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-muted-foreground">
        Showing up to 100 recently updated tasks for the selected status.
      </p>
      <div className="space-y-2" aria-live="polite">
        {tasks.isLoading ? <p role="status">Loading tasks…</p> : null}
        {tasks.isError ? (
          <p role="alert">
            Could not load tasks.{" "}
            <Button variant="link" onClick={() => void tasks.refetch()}>
              Retry
            </Button>
          </p>
        ) : null}
        {!tasks.isLoading && !tasks.isError && (tasks.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {filter === "all" ? "No tasks yet." : "No tasks with this status."}
          </p>
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
                    <p className="min-w-0 [overflow-wrap:anywhere] font-medium">{t.title}</p>
                  </div>
                  {t.description ? (
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                      {t.description}
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={statusClass(t.status)}>
                      {statusLabel(t.status)}
                    </Badge>
                    <Badge variant="outline" className={statusClass(t.priority)}>
                      {statusLabel(t.priority)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {projects.data?.find((p) => p.id === t.project_id)?.name ??
                        (t.project_id ? "Project unavailable" : "No project")}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Updated {new Date(t.updated_at).toLocaleString()}
                    {t.due_at ? ` · Due ${new Date(t.due_at).toLocaleString()}` : ""}
                  </p>
                </div>
                <select
                  className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                  aria-label={`Status for ${t.title}`}
                  disabled={statusMutation.isPending}
                  value={t.status}
                  onChange={(e) =>
                    statusMutation.mutate({ id: t.id, status: e.target.value as TaskStatus })
                  }
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {statusLabel(s)}
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
