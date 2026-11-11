// Minimal static server that mimics the production asset layer: extensionless
// roster paths are served as HTML, exactly as Cloudflare does in production.
//
// This is a local verification harness, not a production server, but it still
// resolves request paths against a fixed root and refuses anything that escapes
// it, so a crafted URL cannot read files outside the built site.
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve("/tmp/site");
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

/**
 * Resolve a request path to a file inside ROOT, or null if it escapes.
 * The resolved path is compared against ROOT with a trailing separator so
 * `/tmp/site-evil` cannot pass as a child of `/tmp/site`.
 */
function resolveInsideRoot(requestPath) {
  const candidate = path.resolve(ROOT, "." + path.posix.normalize(requestPath));
  if (candidate !== ROOT && !candidate.startsWith(ROOT + path.sep)) return null;
  return candidate;
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function isDirectory(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

http
  .createServer((req, res) => {
    const rawPath = decodeURIComponent((req.url || "/").split("?")[0]);
    let file = resolveInsideRoot(rawPath);
    if (file === null) {
      res.writeHead(403, { "content-type": "text/plain" });
      return res.end("forbidden");
    }
    if (isDirectory(file)) file = path.join(file, "index.html");
    if (!isFile(file)) {
      // extensionless roster route -> the platform document
      const alt = resolveInsideRoot(path.posix.join(rawPath, "index.html"));
      if (alt !== null && isFile(alt)) file = alt;
      else {
        res.writeHead(404, { "content-type": "text/plain" });
        return res.end("not found");
      }
    }
    const ext = path.extname(file);
    const type =
      TYPES[ext] || (ext === "" ? "text/html; charset=utf-8" : "application/octet-stream");
    res.writeHead(200, { "content-type": type });
    fs.createReadStream(file).pipe(res);
  })
  .listen(8099, () => console.log("listening 8099"));
