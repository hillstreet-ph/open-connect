/** Serialize each owner's actions and bound sessions; no global shared context. */
export class BrowserPool {
  constructor(factory, { maxSessions = 8, idleMs = 900000 } = {}) {
    this.factory = factory;
    this.maxSessions = maxSessions;
    this.idleMs = idleMs;
    this.sessions = new Map();
  }
  async run(owner, action) {
    let slot = this.sessions.get(owner);
    if (!slot) {
      if (this.sessions.size >= this.maxSessions) throw new Error("capacity");
      slot = {
        backend: null,
        queue: Promise.resolve(),
        touched: Date.now(),
        busy: 0,
        stopped: false,
      };
      this.sessions.set(owner, slot);
    }
    slot.busy++;
    const work = slot.queue.then(async () => {
      if (slot.stopped) throw new Error("task_cancelled");
      if (!slot.backend) slot.backend = await this.factory(owner);
      if (slot.stopped) {
        await slot.backend.close().catch(() => {});
        throw new Error("task_cancelled");
      }
      return action(slot.backend);
    });
    slot.queue = work.catch(() => {});
    try {
      return await work;
    } finally {
      slot.busy--;
      slot.touched = Date.now();
    }
  }
  async cancel(owner) {
    const slot = this.sessions.get(owner);
    if (!slot) return;
    slot.stopped = true;
    await slot.backend?.close().catch(() => {});
    await slot.queue;
    if (this.sessions.get(owner) === slot) this.sessions.delete(owner);
  }
  async sweep(now = Date.now()) {
    for (const [owner, slot] of this.sessions) {
      if (!slot.busy && now - slot.touched >= this.idleMs) {
        this.sessions.delete(owner);
        await slot.backend?.close().catch(() => {});
      }
    }
  }
  async close() {
    await Promise.all([...this.sessions.keys()].map((owner) => this.cancel(owner)));
  }
}
