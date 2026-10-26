import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import net from "node:net";

test("worker fails closed without credentials and rejects untrusted requests", async () => {
  const socket = net.createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const token = randomBytes(32).toString("hex");
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: import.meta.dirname,
    env: { ...process.env, PORT: String(port), PLAYWRIGHT_WORKER_TOKEN: token },
    stdio: "ignore",
  });
  try {
    const url = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        if ((await fetch(url + "/health")).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.equal(ready, true);
    assert.equal((await fetch(url + "/rpc", { method: "POST", body: "{}" })).status, 401);
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    assert.equal((await fetch(url + "/rpc", { method: "POST", headers, body: "{}" })).status, 400);
    headers["X-Browser-Owner"] = "owner-a";
    assert.equal(
      (
        await fetch(url + "/rpc", {
          method: "POST",
          headers,
          body: JSON.stringify({
            method: "tools/call",
            params: { name: "browser_run_code", arguments: {} },
          }),
        })
      ).status,
      400,
    );
  } finally {
    child.kill("SIGTERM");
    await once(child, "exit");
  }
});
