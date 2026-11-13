import { createTask } from "./task-engine.mjs";

// Prepares a batch; does not run commands or grant deployment permissions.
export async function submitBatch({ store, requests, maxBatchSize = 25 }) {
  if (!store?.load || !store?.save) throw new Error("Task store required");
  if (!Array.isArray(requests) || requests.length < 1 || requests.length > maxBatchSize) {
    throw new Error("Invalid batch size");
  }
  const tasks = requests.map((request) => createTask(request));
  if (new Set(tasks.map((task) => task.id)).size !== tasks.length) {
    throw new Error("Duplicate task ids in batch");
  }
  for (const task of tasks) {
    if (await store.load(task.id)) {
      throw new Error(`Task already exists: ${task.id}`);
    }
  }
  const saved = [];
  for (const task of tasks) {
    await store.save(task);
    saved.push(task.id);
  }
  return { accepted: saved, status: "queued", executionStarted: false };
}
