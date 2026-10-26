import { readFile } from "node:fs/promises";
import { dirname, join, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { connect } from "node:net";
import { WebSocketServer } from "ws";
const directory = dirname(fileURLToPath(import.meta.url));
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css" };
export async function serveViewer(req, res) {
  const path = new URL(req.url, "http://worker").pathname;
  let file;
  if (["/viewer", "/viewer.js", "/viewer.css"].includes(path))
    file = join(directory, path === "/viewer" ? "viewer.html" : path.slice(1));
  else if (path.startsWith("/novnc/")) {
    const root = join(directory, "node_modules/@novnc/novnc");
    const target = resolve(root, path.slice(7));
    if (!target.startsWith(root + "/") || extname(target) !== ".js") return false;
    file = target;
  } else return false;
  try {
    const data = await readFile(file);
    res.writeHead(200, {
      "Content-Type": mime[extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors https://open-connect.site https://www.open-connect.site https://*.open-connect-app.pages.dev",
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
  return true;
}
export function attachViewer(server, views) {
  const sockets = new WebSocketServer({
    noServer: true,
    handleProtocols: () => "binary",
    maxPayload: 1024 * 1024,
  });
  server.on("upgrade", (req, socket, head) => {
    const protocols = String(req.headers["sec-websocket-protocol"] ?? "")
      .split(",")
      .map((value) => value.trim());
    const origin = req.headers.origin;
    let sameOrigin = false;
    try {
      sameOrigin = new URL(origin).host === req.headers.host;
    } catch {}
    const entry = protocols[0] === "binary" ? views.get(protocols[1]) : null;
    if (req.url !== "/desktop" || !sameOrigin || !entry) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    sockets.handleUpgrade(req, socket, head, (ws) => {
      entry.sockets.add(ws);
      const vnc = connect(entry.port, "127.0.0.1");
      ws.on("message", (bytes) => {
        if (!vnc.destroyed) vnc.write(bytes);
      });
      vnc.on("data", (bytes) => {
        if (ws.readyState === 1) ws.send(bytes);
      });
      vnc.on("error", () => ws.close(1011, "Browser view unavailable"));
      vnc.on("close", () => ws.close());
      ws.on("error", () => vnc.destroy());
      ws.on("close", () => {
        entry.sockets.delete(ws);
        vnc.destroy();
      });
    });
  });
}
