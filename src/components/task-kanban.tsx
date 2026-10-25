import { useQueries } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listTasks } from "@/lib/ops.functions";
import { TASK_STATUSES, statusClass, statusLabel } from "@/lib/operations";
import { taskBoardColumns, taskMove } from "@/lib/task-board";
import { TaskCard, type TaskChange } from "@/components/task-card";
import { Button } from "@/components/ui/button";

export function TaskKanban({
  userId,
  projects,
  pending,
  onChange,
}: {
  userId: string | undefined;
  projects: readonly { id: string; name: string }[];
  pending: boolean;
  onChange: (input: TaskChange) => void;
}) {
  const list = useServerFn(listTasks);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const queries = useQueries({
    queries: TASK_STATUSES.map((status) => ({
      queryKey: ["tasks", userId, "board", status],
      queryFn: () => list({ data: { status } }),
      enabled: !!userId,
      refetchInterval: 30000,
    })),
  });
  const records = queries.flatMap((query) => query.data ?? []);
  const columns = taskBoardColumns(records);
  return (
    <section aria-label="Task Kanban board" className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Drag a handle between columns, or use a card's status selector on touch and keyboard. Up to
        100 recently updated tasks load per status. Moves are saved to the same task records as List
        view.
      </p>
      <div
        className="flex snap-x gap-3 overflow-x-auto pb-4"
        tabIndex={0}
        aria-label="Scroll task columns horizontally"
      >
        {columns.map((column, index) => (
          <section
            key={column.status}
            aria-label={`${statusLabel(column.status)} tasks`}
            className={`w-[min(80vw,19rem)] shrink-0 snap-start space-y-3 rounded-xl border bg-muted/20 p-3 ${draggedId ? "border-primary/40" : "border-border"}`}
            onDragOver={(event) => {
              if (draggedId && !pending) {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              const id = event.dataTransfer.getData("text/x-open-connect-task");
              if (!pending && draggedId === id) {
                const change = taskMove(records, id, column.status);
                if (change) onChange(change);
              }
              setDraggedId(null);
            }}
          >
            <h3 className="flex items-center justify-between gap-2 text-sm font-semibold">
              <span className={`rounded-md border px-2 py-1 ${statusClass(column.status)}`}>
                {statusLabel(column.status)}
              </span>
              <span
                className="text-xs text-muted-foreground"
                aria-label={`${column.tasks.length} loaded tasks`}
              >
                {column.tasks.length}
              </span>
            </h3>
            {queries[index]?.isPending ? (
              <p role="status" className="text-xs text-muted-foreground">
                Loading…
              </p>
            ) : null}
            {queries[index]?.isError ? (
              <div role="alert" className="text-xs">
                Could not load this column.
                <Button size="sm" variant="link" onClick={() => void queries[index]?.refetch()}>
                  Retry
                </Button>
              </div>
            ) : null}
            {!queries[index]?.isPending && !queries[index]?.isError && column.tasks.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
                No tasks here
              </p>
            ) : null}
            {column.tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                projectName={projects.find((p) => p.id === task.project_id)?.name}
                pending={pending}
                onChange={onChange}
                onDragStart={setDraggedId}
                onDragEnd={() => setDraggedId(null)}
              />
            ))}
          </section>
        ))}
      </div>
    </section>
  );
}
