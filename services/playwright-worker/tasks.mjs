import { randomUUID } from "node:crypto";

/** Task identity is checked centrally on every action, including queued actions. */
export class BrowserTasks {
  constructor({ lifetimeMs = 240000, now = Date.now } = {}) {
    this.active = new Map();
    this.lifetimeMs = lifetimeMs;
    this.now = now;
  }
  start(owner) {
    const previous = this.active.get(owner);
    if (previous && previous.expires > this.now()) throw new Error("task_busy");
    const id = randomUUID();
    this.active.set(owner, { id, expires: this.now() + this.lifetimeMs });
    return id;
  }
  assert(owner, id) {
    const task = this.active.get(owner);
    if (!task || task.id !== id || task.expires <= this.now()) throw new Error("task_cancelled");
  }
  finish(owner, id) {
    if (this.active.get(owner)?.id === id) this.active.delete(owner);
  }
  sweep() {
    for (const [owner, task] of this.active)
      if (task.expires <= this.now()) this.active.delete(owner);
  }
  cancel(owner) {
    this.active.delete(owner);
  }
}
