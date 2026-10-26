import { STATES, transition } from "./task-engine.mjs";

// Executes only caller-provided, explicitly allowlisted operations.
// A production deployment must supply authenticated adapters and a durable lease.
export class TaskRunner {
  constructor({ store, handlers = {}, verifier }) {
    if (!store?.load || !store?.save) throw new Error("Task store required");
    if (typeof verifier !== "function") throw new Error("Verifier required");
    this.store = store;
    this.handlers = handlers;
    this.verifier = verifier;
  }

  async run(id, operation) {
    const handler = Object.hasOwn(this.handlers, operation) ? this.handlers[operation] : null;
    if (typeof handler !== "function") throw new Error("Operation not allowlisted");
    const original = await this.store.load(id);
    if (!original) throw new Error("Task not found");
    if (original.status !== STATES.queued) {
      throw new Error("Only queued tasks may be started");
    }
    let task = transition(original, STATES.running, { actor: "runner" });
    await this.store.save(task);
    try {
      const result = await handler({ task: structuredClone(task) });
      task = transition(task, STATES.validating, { actor: "runner" });
      await this.store.save(task);
      const evidence = await this.verifier({ task: structuredClone(task), result });
      if (!evidence || typeof evidence !== "string") {
        throw new Error("Verifier did not provide evidence");
      }
      task = transition(task, STATES.completed, {
        actor: "verifier",
        evidence,
      });
      await this.store.save(task);
      return task;
    } catch (error) {
      task = transition(task, STATES.failed, {
        actor: "runner",
        evidence: String(error?.message || error),
      });
      await this.store.save(task);
      throw error;
    }
  }
}
