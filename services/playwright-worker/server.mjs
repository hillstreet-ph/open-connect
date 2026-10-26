import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrowserPool } from "./pool.mjs";
import { ownerProfile } from "./profiles.mjs";
import { PLAYWRIGHT_TOOLS } from "./policy.mjs";

const token = process.env.PLAYWRIGHT_WORKER_TOKEN;
if (!token || token.length < 32)
  throw new Error("A worker token of at least 32 characters is required.");
const pool = new BrowserPool(async (owner) => {
  const profile = await ownerProfile(process.env.PLAYWRIGHT_PROFILE_ROOT, owner);
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
  const directory = await mkdtemp(join(tmpdir(), "oc-browser-"));
  const client = new Client({ name: "open-connect", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      join(process.cwd(), "node_modules/@playwright/mcp/cli.js"),
      "--headless",
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
    },
    stderr: "ignore",
  });
  try {
    await client.connect(transport);
  } catch (error) {
    await transport.close().catch(() => {});
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
  return {
    list: () => client.listTools(),
    call: (params) => client.callTool(params, undefined, { timeout: 60000 }),
    close: async () => {
      await client.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
});
const sweep = setInterval(() => void pool.sweep(), 30000);
sweep.unref();
const server = http.createServer(async (req, res) => {
  const send = (status, value) => {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(value));
  };
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
    const result = await pool.run(owner, async (backend) =>
      input.method === "tools/list"
        ? {
            engine: "playwright",
            profileMode: process.env.PLAYWRIGHT_PROFILE_ROOT ? "persistent" : "ephemeral",
            tools: (await backend.list()).tools.filter((tool) => PLAYWRIGHT_TOOLS.has(tool.name)),
          }
        : backend.call(input.params),
    );
    send(200, result);
  } catch (error) {
    send(error.message === "capacity" ? 429 : 502, { error: "browser_operation_failed" });
  }
});
server.requestTimeout = 90000;
server.listen(Number(process.env.PORT ?? 8080), "0.0.0.0");
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    server.close();
    void pool.close().finally(() => process.exit(0));
  });
