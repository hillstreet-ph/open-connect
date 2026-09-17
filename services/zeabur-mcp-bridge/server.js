import http from "node:http";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import httpProxy from "http-proxy";

const publicPort = Number(process.env.PORT || 8080);
const upstreamPort = Number(process.env.MCP_UPSTREAM_PORT || 8001);
const bridgeToken = process.env.MCP_BRIDGE_TOKEN;
if (!process.env.ZEABUR_TOKEN) throw new Error("ZEABUR_TOKEN is required");
if (!bridgeToken) throw new Error("MCP_BRIDGE_TOKEN is required");

const gateway = spawn(process.execPath, [
  "node_modules/supergateway/dist/index.js",
  "--stdio", "node node_modules/@zeabur/mcp-server/dist/index.js",
  "--outputTransport", "streamableHttp", "--stateful",
  "--streamableHttpPath", "/mcp", "--healthEndpoint", "/healthz",
  "--port", String(upstreamPort)
], { env: process.env, stdio: ["ignore", "inherit", "inherit"] });

gateway.on("exit", (code, signal) => {
  console.error(`MCP gateway exited code=${code} signal=${signal}`);
  process.exit(code ?? 1);
});

const proxy = httpProxy.createProxyServer({ target: `http://127.0.0.1:${upstreamPort}`, xfwd: true });
proxy.on("error", (error, _req, res) => {
  console.error("Proxy error", error.message);
  if (!res.headersSent) res.writeHead(502, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "MCP upstream unavailable" }));
});

function authorized(req) {
  const value = req.headers.authorization || "";
  const supplied = value.startsWith("Bearer ") ? value.slice(7) : "";
  const expected = Buffer.from(bridgeToken);
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

const server = http.createServer((req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    return res.end(JSON.stringify({ status: "ok" }));
  }
  if (!req.url?.startsWith("/mcp")) {
    res.writeHead(404, { "content-type": "application/json" });
    return res.end(JSON.stringify({ error: "not found" }));
  }
  if (!authorized(req)) {
    res.writeHead(401, { "content-type": "application/json", "www-authenticate": "Bearer", "cache-control": "no-store" });
    return res.end(JSON.stringify({ error: "unauthorized" }));
  }
  proxy.web(req, res);
});

server.listen(publicPort, "0.0.0.0", () => console.log(`Authenticated Zeabur MCP bridge listening on :${publicPort}`));

function shutdown(signal) {
  console.log(`Received ${signal}; shutting down`);
  gateway.kill("SIGTERM");
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
