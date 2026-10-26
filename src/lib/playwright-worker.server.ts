import { assertPlaywrightTool } from "./playwright-policy";
export class PlaywrightTaskCancelledError extends Error {
  constructor() {
    super("Browser task was cancelled.");
    this.name = "PlaywrightTaskCancelledError";
  }
}
/** Only the authenticated gateway supplies owner and worker credentials. */
async function workerRpc(owner: string, payload: Record<string, unknown>) {
  const endpoint = process.env["PLAYWRIGHT_WORKER_URL"];
  const token = process.env["PLAYWRIGHT_WORKER_TOKEN"];
  if (!endpoint || !token)
    throw new Error("Playwright worker is not configured. Contact your administrator.");
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error("Playwright worker requires HTTPS.");
  const response = await fetch(new URL("/rpc", url), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Browser-Owner": owner,
    },
    body: JSON.stringify(payload),
    redirect: "error",
    signal: AbortSignal.timeout(90000),
  });
  if (response.status === 409) {
    const problem = await response.json().catch(() => ({}));
    if (problem.error === "task_cancelled") throw new PlaywrightTaskCancelledError();
    throw new Error(
      "Browser control is busy. End manual sign-in or stop the active task before starting another.",
    );
  }
  if (!response.ok) throw new Error(`Playwright worker unavailable (HTTP ${response.status}).`);
  return response.json();
}

export function playwrightWorker(
  owner: string,
  tool?: string,
  args: Record<string, unknown> = {},
  taskId?: string,
) {
  if (tool) assertPlaywrightTool(tool);
  return workerRpc(owner, {
    ...(tool
      ? { method: "tools/call", params: { name: tool, arguments: args } }
      : { method: "tools/list" }),
    ...(taskId ? { taskId } : {}),
  });
}
export function playwrightTaskControl(
  owner: string,
  operation: "start" | "cancel" | "check" | "finish",
  taskId?: string,
) {
  return workerRpc(owner, { method: `task/${operation}`, ...(taskId ? { taskId } : {}) });
}

export function playwrightViewControl(owner: string, operation: "start" | "end", url?: string) {
  return workerRpc(owner, { method: `view/${operation}`, ...(url ? { url } : {}) });
}
