// Minimal static server that mimics the production asset layer: extensionless
// roster paths are served as HTML, exactly as Cloudflare does in production.
//
// This is a local verification harness, not a production server. Rather than
// resolving the request path against the filesystem at all, it serves from an
// explicit allowlist of the files the platform actually ships. A request that
// is not on the list is a 404, so no request string ever reaches a path
// expression and there is nothing to traverse out of.
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve("/tmp/site/ai-factory/roster");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".md": "text/markdown; charset=utf-8",
};

// The nine roster routes, all served by the one merged platform document.
const ROUTES = [
  "/",
  "/index.html",
  "/teams",
  "/teams.html",
  "/niches",
  "/niches.html",
  "/playbooks",
  "/playbooks.html",
  "/hub",
  "/hub.html",
  "/studio",
  "/studio.html",
  "/connectors",
  "/connectors.html",
  "/command-center",
  "/command-center.html",
  "/registry",
  "/registry.html",
];

/** Every file the harness will serve, as a fixed relative path. */
function buildAllowlist() {
  const files = new Set();
  for (const route of ROUTES) files.add(route === "/" ? "index.html" : route.replace(/^\//, ""));
  // Walk each asset directory recursively: agent avatars live one level
  // down in images/agents/, so a top-level scan would miss all 103 of them.
  const walk = (dir, prefix) => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
      else if (entry.isFile()) files.add(rel);
    }
  };
  for (const dir of ["assets", "data", "images", "import"]) {
    walk(path.join(ROOT, dir), dir);
  }
  return files;
}

const ALLOWED = buildAllowlist();

http
  .createServer((req, res) => {
    const rawPath = (req.url || "/").split("?")[0];
    let decoded;
    try {
      decoded = decodeURIComponent(rawPath);
    } catch {
      res.writeHead(400, { "content-type": "text/plain" });
      return res.end("bad request");
    }

    // Look the request up in the allowlist. The value that reaches the
    // filesystem is the allowlisted entry, never the request string.
    const PREFIX = "/ai-factory/roster";
    const stripped = decoded.startsWith(PREFIX) ? decoded.slice(PREFIX.length) : decoded;
    const key = stripped.replace(/^\//, "") || "index.html";

    // The site root serves a favicon in production; mirror that so the
    // harness does not report a 404 the real deployment never produces.
    if (key === "favicon.ico") {
      const icon = path.join(ROOT, "..", "..", "..", "favicon.ico");
      if (fs.existsSync(icon)) {
        res.writeHead(200, { "content-type": "image/x-icon" });
        return fs.createReadStream(icon).pipe(res);
      }
      res.writeHead(204);
      return res.end();
    }

    const relative = ALLOWED.has(key) ? key : null;
    if (relative === null) {
      res.writeHead(404, { "content-type": "text/plain" });
      return res.end("not found");
    }

    const file = path.join(ROOT, relative);
    const ext = path.extname(relative);
    const type =
      TYPES[ext] || (ext === "" ? "text/html; charset=utf-8" : "application/octet-stream");
    res.writeHead(200, { "content-type": type });
    fs.createReadStream(file).pipe(res);
  })
  .listen(8099, () => console.log("listening 8099"));
