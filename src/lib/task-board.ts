import { TASK_STATUSES } from "./operations.ts";
export type TaskRecord = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_at: string | null;
  project_id: string | null;
  updated_at: string;
};
export type BoardStatus = (typeof TASK_STATUSES)[number];

/** Polling can briefly return a moved card in two cached column queries. */
export function taskBoardColumns(records: readonly TaskRecord[]) {
  const newest = new Map<string, TaskRecord>();
  for (const task of records) {
    const current = newest.get(task.id);
    if (!current || Date.parse(task.updated_at) > Date.parse(current.updated_at))
      newest.set(task.id, task);
  }
  return TASK_STATUSES.map((status) => ({
    status,
    tasks: [...newest.values()]
      .filter((task) => task.status === status)
      .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)),
  }));
}
export function taskMove(records: readonly TaskRecord[], id: string, status: string) {
  if (!(TASK_STATUSES as readonly string[]).includes(status)) return null;
  const task = taskBoardColumns(records)
    .flatMap((column) => column.tasks)
    .find((item) => item.id === id);
  if (!task || task.status === status) return null;
  return { id, status: status as BoardStatus, expectedUpdatedAt: task.updated_at };
}
