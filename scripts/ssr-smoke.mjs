import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

const origin = "http://127.0.0.1:4199";
const server = spawn(
  "bun",
  ["run", "dev", "--host", "127.0.0.1", "--port", "4199", "--strictPort"],
  {
    env: process.env,
    stdio: "ignore",
    detached: true,
  },
);
let startupError;
server.on("error", (error) => {
  startupError = error;
});

try {
  let reachable = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    if (startupError || server.exitCode !== null) throw new Error("SSR server failed to start");
    try {
      await fetch(origin, { signal: AbortSignal.timeout(5000) });
      reachable = true;
      break;
    } catch {
      await delay(1000);
    }
  }
  assert.ok(reachable, "SSR server did not become reachable");
  for (const path of ["/", "/auth", "/models", "/resources"]) {
    const response = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(30000) });
    assert.equal(response.status, 200, `${path} must render successfully`);
    const html = await response.text();
    assert.match(html, /<html/i, `${path} must render an HTML page`);
    assert.doesNotMatch(
      html,
      /This page didn(?:'|&#x27;|&#39;)t load/,
      `${path} rendered an error boundary`,
    );
    console.log(`SSR ${path}: 200, HTML rendered`);
  }
} finally {
  if (server.pid) {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      /* Already exited. */
    }
    await Promise.race([once(server, "exit"), delay(5000)]);
    try {
      process.kill(-server.pid, "SIGKILL");
    } catch {
      /* Already exited. */
    }
  }
}
