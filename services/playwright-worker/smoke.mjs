// Run against the authenticated candidate container; prints checks, never credentials.
const origin = process.env.PLAYWRIGHT_SMOKE_ORIGIN ?? "http://127.0.0.1:8080";
const token = process.env.PLAYWRIGHT_WORKER_TOKEN;
if (!token) throw new Error("Worker token required");
async function rpc(owner, name, args, taskId) {
  const response = await fetch(origin + "/rpc", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Browser-Owner": owner,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      name
        ? { method: "tools/call", params: { name, arguments: args }, ...(taskId ? { taskId } : {}) }
        : { method: "tools/list" },
    ),
    signal: AbortSignal.timeout(90000),
  });
  const value = await response.json();
  if (!response.ok || value.isError)
    throw new Error(
      `Browser smoke failed: ${name ?? "catalog"} HTTP ${response.status}: ${JSON.stringify(value).slice(0, 1500)}`,
    );
  return value;
}
async function taskControl(owner, method, taskId) {
  const r = await fetch(origin + "/rpc", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Browser-Owner": owner,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ method: `task/${method}`, ...(taskId ? { taskId } : {}) }),
    signal: AbortSignal.timeout(90000),
  });
  if (!r.ok) throw new Error(`Task control failed: ${method} HTTP ${r.status}`);
  return r.json();
}
let ready = false;
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    if ((await fetch(origin + "/health")).ok) {
      ready = true;
      break;
    }
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
if (!ready) throw new Error("Worker did not become ready");
const fixture = process.env.PLAYWRIGHT_SMOKE_FIXTURE;
try {
  const catalog = await rpc("smoke-a");
  if (!catalog.tools.some((tool) => tool.name === "browser_snapshot"))
    throw new Error("Missing Playwright tools");
  if (!process.env.PLAYWRIGHT_SMOKE_RESUME) {
    await rpc("smoke-a", "browser_navigate", { url: "https://example.com" });
    if (!JSON.stringify(await rpc("smoke-a", "browser_snapshot", {})).includes("Example Domain"))
      throw new Error("Navigation was not verified");
    const screenshot = await rpc("smoke-a", "browser_take_screenshot", { type: "png" });
    if (!screenshot.content?.some((item) => item.type === "image" && item.data))
      throw new Error("Screenshot returned no image");
    const other = await rpc("smoke-b", "browser_snapshot", {});
    if (JSON.stringify(other).includes("Example Domain")) throw new Error("Cross-owner page leak");
    const { taskId } = await taskControl("smoke-a", "start");
    await taskControl("smoke-a", "check", taskId);
    await taskControl("smoke-a", "cancel");
    const blocked = await fetch(origin + "/rpc", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Browser-Owner": "smoke-a",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        method: "tools/call",
        taskId,
        params: { name: "browser_navigate", arguments: { url: "https://example.com" } },
      }),
    });
    if (blocked.status !== 409) throw new Error("Cancelled task reopened the browser");
    const next = await taskControl("smoke-a", "start");
    await rpc("smoke-a", "browser_snapshot", {}, next.taskId);
    await taskControl("smoke-a", "finish", next.taskId);
    if (fixture) await rpc("smoke-a", "browser_navigate", { url: fixture + "/signin" });
  }
  if (fixture) {
    await rpc("smoke-a", "browser_close", {});
    await rpc("smoke-a", "browser_navigate", { url: fixture });
    if (!JSON.stringify(await rpc("smoke-a", "browser_snapshot", {})).includes("Signed in"))
      throw new Error("Owned sign-in did not persist");
    await rpc("smoke-b", "browser_navigate", { url: fixture });
    if (!JSON.stringify(await rpc("smoke-b", "browser_snapshot", {})).includes("Signed out"))
      throw new Error("Cross-owner cookie leak");
  }
  console.log(
    "PASS: browser execution, screenshots, owner isolation, cancellation and restart" +
      (fixture ? ", owned sign-in persistence" : ""),
  );
} finally {
  await taskControl("smoke-a", "cancel").catch(() => {});
  await taskControl("smoke-b", "cancel").catch(() => {});
}
