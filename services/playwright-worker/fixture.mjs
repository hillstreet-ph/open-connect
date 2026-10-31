// CI-only sign-in fixture. It is never started by the deployed worker.
import http from "node:http";
http
  .createServer((req, res) => {
    if (req.url === "/paste") {
      res.setHeader("Content-Type", "text/html");
      return res.end(
        '<html><body><input autofocus oninput="document.getElementById(\'output\').textContent=this.value"><p id="output"></p></body></html>',
      );
    }
    if (req.url === "/signin")
      res.setHeader("Set-Cookie", "session=fixture; Path=/; Max-Age=3600; HttpOnly; SameSite=Lax");
    const signedIn = req.url === "/signin" || req.headers.cookie?.includes("session=fixture");
    res.setHeader("Content-Type", "text/html");
    res.end(
      `<html><head><title>${signedIn ? "Signed in" : "Signed out"}</title></head><body><h1>${signedIn ? "Signed in" : "Signed out"}</h1></body></html>`,
    );
  })
  .listen(8081, "127.0.0.1");
