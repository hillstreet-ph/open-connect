// CI-only real viewer/keyboard verification; never prints grants or credentials.
import { chromium } from "playwright";
const origin = "http://127.0.0.1:8080";
const headers = {
  Authorization: `Bearer ${process.env.PLAYWRIGHT_WORKER_TOKEN}`,
  "X-Browser-Owner": "smoke-a",
  "Content-Type": "application/json",
};
async function rpc(payload, expected = 200) {
  const response = await fetch(origin + "/rpc", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(90000),
  });
  if (response.status !== expected)
    throw new Error(`Live browser check returned HTTP ${response.status}`);
  return response.json();
}
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
  env: { PATH: process.env.PATH, HOME: "/tmp", PLAYWRIGHT_BROWSERS_PATH: "/opt/browsers" },
});
try {
  const view = await rpc({ method: "view/start", url: "https://example.com" });
  await rpc({ method: "task/start" }, 409);
  await rpc({ method: "tools/call", params: { name: "browser_snapshot", arguments: {} } }, 409);
  const page = await browser.newPage({ viewport: { width: 1280, height: 1024 } });
  await page.goto(origin + "/viewer");
  await page.evaluate(
    (token) => window.postMessage({ viewToken: token }, location.origin),
    view.token,
  );
  await page.waitForFunction(
    () => document.getElementById("status").textContent.includes("connected"),
    { timeout: 30000 },
  );
  await page.locator("#focus").click();
  await page.keyboard.press("Control+l");
  await page.keyboard.type("https://example.com/?manual-browser-proof=1");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(2000);
  await rpc({ method: "view/end" });
  const snapshot = await rpc({
    method: "tools/call",
    params: { name: "browser_snapshot", arguments: {} },
  });
  if (!JSON.stringify(snapshot).includes("manual-browser-proof=1"))
    throw new Error("Viewer keyboard input did not reach the browser");
  console.log("PASS: live view, manual keyboard, paused agent control and resume");
} finally {
  await rpc({ method: "task/cancel" }).catch(() => {});
  await browser.close();
  headers.Authorization = "";
}
