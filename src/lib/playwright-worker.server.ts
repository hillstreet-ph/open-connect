import { assertPlaywrightTool } from "./playwright-policy";

/** Only the authenticated gateway supplies owner and worker credentials. */
export async function playwrightWorker(
  owner: string,
  tool?: string,
  args: Record<string, unknown> = {},
) {
  if (tool) assertPlaywrightTool(tool);
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
    body: JSON.stringify(
      tool
        ? { method: "tools/call", params: { name: tool, arguments: args } }
        : { method: "tools/list" },
    ),
    redirect: "error",
    signal: AbortSignal.timeout(90000),
  });
  if (!response.ok) throw new Error(`Playwright worker unavailable (HTTP ${response.status}).`);
  return response.json();
}
