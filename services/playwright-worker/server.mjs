import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDesktop } from "./desktop.mjs";
import { BrowserViews } from "./views.mjs";
import { serveViewer, attachViewer } from "./live-view.mjs";
import { BrowserTasks } from "./tasks.mjs";
import { BrowserPool } from "./pool.mjs";
import { ownerProfile } from "./profiles.mjs";
import { PLAYWRIGHT_TOOLS } from "./policy.mjs";

const token = process.env.PLAYWRIGHT_WORKER_TOKEN;
if (!token || token.length < 32)
  throw new Error("A worker token of at least 32 characters is required.");
const tasks = new BrowserTasks();
const views = new BrowserViews();
const pool = new BrowserPool(async (owner) => {
  const profile = await ownerProfile(process.env.PLAYWRIGHT_PROFILE_ROOT, owner);
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
  const directory = await mkdtemp(join(tmpdir(), "oc-browser-"));
  let desktop;
  try {
    desktop = await createDesktop(directory);
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  const client = new Client({ name: "open-connect", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      join(process.cwd(), "node_modules/@playwright/mcp/cli.js"),
      ...(desktop ? [] : ["--headless"]),
      "--browser",
      "chromium",
      ...(profile ? ["--user-data-dir", profile] : ["--isolated"]),
      "--no-sandbox",
      "--output-dir",
      directory,
    ],
    cwd: directory,
    // Do not inherit the worker token or other deployment secrets in the browser process.
    env: {
      PATH: process.env.PATH,
      HOME: directory,
      PLAYWRIGHT_BROWSERS_PATH: "/opt/browsers",
      ...(desktop ? { DISPLAY: desktop.display } : {}),
    },
    stderr: "ignore",
  });
  try {
    await client.connect(transport);
  } catch (error) {
    await transport.close().catch(() => {});
    await desktop?.close();
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  let closing;
  const close = () => (closing ??= closeBrowser());
  const closeBrowser = async () => {
    views.end(owner);
    try {
      await client
        .callTool({ name: "browser_close", arguments: {} }, undefined, { timeout: 5000 })
        .catch(() => {});
      await client.close();
    } finally {
      await desktop?.close();
      await rm(directory, { recursive: true, force: true });
    }
  };
  return {
    list: () => client.listTools(),
    call: (params) => client.callTool(params, undefined, { timeout: 60000 }),
    desktop,
    close,
  };
});
const sweep = setInterval(() => {
  tasks.sweep();
  views.sweep();
  void pool.sweep();
}, 30000);
sweep.unref();
const server = http.createServer(async (req, res) => {
  const send = (status, value) => {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(value));
  };
  if (req.method === "GET" && (await serveViewer(req, res))) return;
  if (req.url === "/health" && req.method === "GET")
    return send(200, { engine: "playwright", status: "process_ready" });
  const auth = Buffer.from(req.headers.authorization ?? "");
  const expected = Buffer.from(`Bearer ${token}`);
  if (auth.length !== expected.length || !timingSafeEqual(auth, expected))
    return send(401, { error: "unauthorized" });
  const owner = req.headers["x-browser-owner"];
  if (typeof owner !== "string" || !/^[a-zA-Z0-9:_-]{1,200}$/.test(owner))
    return send(400, { error: "owner_required" });
  if (req.method !== "POST" || req.url !== "/rpc") return send(404, { error: "not_found" });
  try {
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (Buffer.byteLength(body) > 65536) return send(413, { error: "body_too_large" });
    }
    const input = JSON.parse(body);
    if (input.method === "view/start") {
      if (process.env.PLAYWRIGHT_LIVE_VIEW !== "1")
        return send(503, { error: "live_view_disabled" });
      const destination = new URL(input.url);
      if (
        destination.protocol !== "https:" ||
        destination.username ||
        destination.password ||
        String(input.url).length > 2048
      )
        return send(400, { error: "https_destination_required" });
      views.end(owner);
      tasks.cancel(owner);
      await pool.cancel(owner);
      const viewer = await pool.run(owner, async (backend) => {
        const navigated = await backend.call({
          name: "browser_navigate",
          arguments: { url: destination.href },
        });
        if (navigated.isError || !backend.desktop) throw new Error("browser_operation_failed");
        return views.issue(owner, backend.desktop.port);
      });
      return send(200, viewer);
    }
    if (input.method === "view/end") {
      views.end(owner);
      return send(200, { ended: true });
    }
    if (input.method === "task/start") {
      if (views.hasOwner(owner)) throw new Error("task_busy");
      return send(200, { taskId: tasks.start(owner) });
    }
    if (input.method === "task/cancel") {
      tasks.cancel(owner);
      views.end(owner);
      await pool.cancel(owner);
      return send(200, { cancelled: true });
    }
    if (input.method === "task/finish") {
      tasks.finish(owner, input.taskId);
      return send(200, { finished: true });
    }
    if (input.method === "task/check") {
      tasks.assert(owner, input.taskId);
      return send(200, { active: true });
    }
    if (input.taskId) tasks.assert(owner, input.taskId);
    if (input.method === "tools/call" && views.hasOwner(owner)) throw new Error("task_busy");
    if (input.method !== "tools/list" && input.method !== "tools/call")
      return send(400, { error: "unsupported_method" });
    if (
      input.method === "tools/call" &&
      (!PLAYWRIGHT_TOOLS.has(input.params?.name) ||
        !input.params.arguments ||
        typeof input.params.arguments !== "object" ||
        Array.isArray(input.params.arguments))
    )
      return send(400, { error: "unsupported_tool_or_arguments" });
    if (
      input.params?.name === "browser_take_screenshot" &&
      input.params.arguments.filename &&
      !/^[A-Za-z0-9_-]+\.(png|jpeg|jpg)$/.test(input.params.arguments.filename)
    )
      return send(400, { error: "invalid_artifact_filename" });
    const result = await pool.run(owner, async (backend) => {
      if (input.taskId) tasks.assert(owner, input.taskId);
      if (input.method === "tools/call" && views.hasOwner(owner)) throw new Error("task_busy");
      return input.method === "tools/list"
        ? {
            engine: "playwright",
            liveViewEnabled: process.env.PLAYWRIGHT_LIVE_VIEW === "1",
            profileMode: process.env.PLAYWRIGHT_PROFILE_ROOT ? "persistent" : "ephemeral",
            tools: (await backend.list()).tools.filter((tool) => PLAYWRIGHT_TOOLS.has(tool.name)),
          }
        : backend.call(input.params);
    });
    send(200, result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    send(code === "capacity" ? 429 : ["task_cancelled", "task_busy"].includes(code) ? 409 : 502, {
      error: ["task_cancelled", "task_busy"].includes(code) ? code : "browser_operation_failed",
    });
  }
});
attachViewer(server, views);
server.requestTimeout = 90000;
server.listen(Number(process.env.PORT ?? 8080), "0.0.0.0");
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    server.close();
    void pool.close().finally(() => process.exit(0));
  });
