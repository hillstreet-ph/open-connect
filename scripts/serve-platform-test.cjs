// Minimal static server that mimics the production asset layer: extensionless
// roster paths are served as HTML, exactly as Cloudflare does in production.
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = "/tmp/site";
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

http
  .createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    let file = path.join(ROOT, p);
    if (fs.existsSync(file) && fs.statSync(file).isDirectory())
      file = path.join(file, "index.html");
    if (!fs.existsSync(file)) {
      // extensionless roster route -> the platform document
      const alt = path.join(ROOT, p, "index.html");
      if (fs.existsSync(alt)) file = alt;
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
