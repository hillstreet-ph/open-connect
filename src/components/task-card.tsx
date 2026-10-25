import { GripVertical } from "lucide-react";
import { statusClass, statusLabel, TASK_STATUSES } from "@/lib/operations";
import type { BoardStatus, TaskRecord } from "@/lib/task-board";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export type TaskChange = { id: string; status: BoardStatus; expectedUpdatedAt: string };
export function TaskCard({
  task,
  projectName,
  pending,
  onChange,
  onDragStart,
  onDragEnd,
}: {
  task: TaskRecord;
  projectName?: string | undefined;
  pending: boolean;
  onChange: (input: TaskChange) => void;
  onDragStart?: (id: string) => void;
  onDragEnd?: () => void;
}) {
  return (
    <Card className="min-w-0 space-y-3 p-4 shadow-panel">
      <div className="flex items-start gap-2">
        {onDragStart ? (
          <button
            type="button"
            draggable={!pending}
            disabled={pending}
            aria-label={`Drag ${task.title}; use status selector to move with a keyboard`}
            className="shrink-0 cursor-grab rounded p-1 text-muted-foreground hover:bg-accent focus-visible:outline focus-visible:outline-2"
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/x-open-connect-task", task.id);
              onDragStart(task.id);
            }}
            onDragEnd={onDragEnd}
          >
            <GripVertical className="size-4" />
          </button>
        ) : null}
        <p className="min-w-0 font-medium [overflow-wrap:anywhere]">{task.title}</p>
      </div>
      {task.description ? (
        <p className="whitespace-pre-wrap text-sm text-muted-foreground [overflow-wrap:anywhere]">
          {task.description}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={statusClass(task.priority)}>
          {statusLabel(task.priority)}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {projectName ?? (task.project_id ? "Project unavailable" : "No project")}
        </span>
      </div>
      <select
        aria-label={`Status for ${task.title}`}
        disabled={pending}
        value={task.status}
        className={`h-9 w-full rounded-md border px-2 text-xs ${statusClass(task.status)}`}
        onChange={(event) =>
          onChange({
            id: task.id,
            status: event.target.value as BoardStatus,
            expectedUpdatedAt: task.updated_at,
          })
        }
      >
        {!TASK_STATUSES.some((s) => s === task.status) ? (
          <option value={task.status}>{statusLabel(task.status)}</option>
        ) : null}
        {TASK_STATUSES.map((status) => (
          <option key={status} value={status} className="bg-background text-foreground">
            {statusLabel(status)}
          </option>
        ))}
      </select>
      <p className="text-xs text-muted-foreground">
        Updated {new Date(task.updated_at).toLocaleString()}
        {task.due_at ? ` · Due ${new Date(task.due_at).toLocaleString()}` : ""}
      </p>
    </Card>
  );
}
