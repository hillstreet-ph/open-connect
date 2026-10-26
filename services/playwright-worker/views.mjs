import { randomBytes } from "node:crypto";
export class BrowserViews {
  constructor({ lifetimeMs = 600000, now = Date.now } = {}) {
    this.entries = new Map();
    this.lifetimeMs = lifetimeMs;
    this.now = now;
  }
  issue(owner, port) {
    this.end(owner);
    const token = randomBytes(32).toString("base64url");
    const entry = { owner, port, expires: this.now() + this.lifetimeMs, sockets: new Set() };
    this.entries.set(token, entry);
    return { token, expiresAt: new Date(entry.expires).toISOString() };
  }
  get(token) {
    const entry = this.entries.get(token);
    if (!entry || entry.expires <= this.now()) {
      if (entry) this.end(entry.owner);
      return null;
    }
    return entry;
  }
  hasOwner(owner) {
    for (const [token, entry] of this.entries)
      if (entry.owner === owner && this.get(token)) return true;
    return false;
  }
  end(owner) {
    for (const [token, entry] of this.entries)
      if (entry.owner === owner) {
        this.entries.delete(token);
        for (const socket of entry.sockets) socket.close(1000, "Session ended");
      }
  }
  sweep() {
    for (const token of this.entries.keys()) this.get(token);
  }
}
