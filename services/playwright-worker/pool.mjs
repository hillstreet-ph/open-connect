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
      slot = { backend: null, queue: Promise.resolve(), touched: Date.now(), busy: 0 };
      this.sessions.set(owner, slot);
    }
    slot.busy++;
    const work = slot.queue.then(async () => {
      if (!slot.backend) slot.backend = await this.factory(owner);
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
  async sweep(now = Date.now()) {
    for (const [owner, slot] of this.sessions) {
      if (!slot.busy && now - slot.touched >= this.idleMs) {
        this.sessions.delete(owner);
        await slot.backend?.close().catch(() => {});
      }
    }
  }
  async close() {
    await Promise.all(
      [...this.sessions.values()].map(async (slot) => {
        await slot.queue;
        await slot.backend?.close().catch(() => {});
      }),
    );
    this.sessions.clear();
  }
}
