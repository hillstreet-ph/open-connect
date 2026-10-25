import { createHmac, timingSafeEqual } from "node:crypto";
import { BrowserUse, type RunCreateBody } from "browser-use-sdk/v4";
import Browserbase from "@browserbasehq/sdk";
import { z } from "zod";

export const providerSchema = z.enum(["browser_use", "browserbase"]);
export const handleSchema = z.object({
  provider: providerSchema,
  connectionId: z.string().uuid().nullable(),
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  signature: z.string().regex(/^[a-f0-9]{64}$/),
});
export type ProviderHandle = z.infer<typeof handleSchema>;
export const browserUseInput = z.object({
  task: z.string().trim().min(1).max(8000),
  model: z.string().trim().min(1).max(100).optional(),
  modelParams: z.record(z.string(), z.unknown()).optional(),
  maxCostUsd: z.number().positive().max(1).default(1),
});
export function runBody(input: unknown): RunCreateBody {
  const data = browserUseInput.parse(input);
  return {
    task: data.task,
    maxCostUsd: data.maxCostUsd,
    keepAlive: 120,
    ...(data.model !== undefined ? { model: data.model } : {}),
    ...(data.modelParams !== undefined ? { modelParams: data.modelParams } : {}),
  };
}
export function signHandle(
  key: string,
  userId: string,
  handle: Omit<ProviderHandle, "signature">,
): ProviderHandle {
  const signature = createHmac("sha256", key)
    .update(
      JSON.stringify([
        "open-connect-browser-v1",
        userId,
        handle.provider,
        handle.connectionId,
        handle.id,
        handle.sessionId,
      ]),
    )
    .digest("hex");
  return { ...handle, signature };
}
export function verifyHandle(key: string, userId: string, input: ProviderHandle) {
  const handle = handleSchema.parse(input);
  const expected = signHandle(key, userId, handle).signature;
  if (!timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(handle.signature, "hex")))
    throw new Error("Browser reference does not belong to this account and connection.");
}
export function browserUseClient(apiKey: string) {
  return new BrowserUse({ apiKey, maxRetries: 0, timeout: 20000 });
}
export function browserbaseClient(apiKey: string, send?: typeof fetch) {
  return new Browserbase({
    apiKey,
    maxRetries: 0,
    timeout: 20000,
    ...(send ? { fetch: send } : {}),
  });
}
export async function readBrowserUse(
  client: Pick<BrowserUse, "runs" | "browsers">,
  id: string,
  sessionId: string,
) {
  const { status } = await client.runs.status(id);
  const terminal = ["completed", "failed", "cancelled"].includes(status);
  const summary = terminal ? await client.runs.get(id) : null;
  let cleanupConfirmed = false;
  const browsers = await client.browsers.list({
    agentSessionId: sessionId,
    filterBy: "active",
    pageSize: 100,
  });
  // A new run owns a new session; never stop any other session's browser.
  const owned = browsers.items.filter((item) => item.agentSessionId === sessionId);
  if (terminal) {
    const stopped = await Promise.all(owned.map((browser) => client.browsers.stop(browser.id)));
    cleanupConfirmed =
      browsers.totalItems <= browsers.items.length &&
      stopped.every((browser) => browser.status === "stopped");
  }
  return {
    status,
    terminal,
    success: status === "completed" && Boolean(summary?.result?.trim() || summary?.output),
    result: summary?.output ?? summary?.result ?? null,
    error: summary?.error ?? null,
    cleanupConfirmed,
    liveUrl: terminal ? null : (owned[0]?.liveUrl ?? null),
    costUsd: summary?.totalCostUsd ?? null,
  };
}

export async function providerCredential(
  userId: string,
  provider: z.infer<typeof providerSchema>,
  connectionId?: string | null,
): Promise<{ apiKey: string; connectionId: string | null }> {
  const variable = provider === "browser_use" ? "BROWSER_USE_API_KEY" : "BROWSERBASE_API_KEY";
  if (connectionId === null) {
    if (process.env["BROWSER_PROVIDER_OWNER_ID"] !== userId || !process.env[variable])
      throw new Error(
        "The original deployment credential is unavailable. Check the provider dashboard.",
      );
    return { apiKey: process.env[variable]!, connectionId: null };
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let query = supabaseAdmin
    .from("app_connections")
    .select("id,user_id,credential_reference")
    .eq("user_id", userId)
    .eq("provider", provider)
    .eq("status", "connected")
    .like("credential_reference", "credential://%")
    .order("updated_at", { ascending: false })
    .limit(1);
  if (connectionId) query = query.eq("id", connectionId);
  const { data, error } = await query;
  if (error) throw new Error("Could not read your browser provider connection.");
  const connection = data?.[0];
  if (connection) {
    const { resolveCredential } = await import("./custom-mcp.server");
    return {
      apiKey: await resolveCredential(userId, connection.credential_reference),
      connectionId: connection.id,
    };
  }
  // A shared deployment key is usable only by its explicitly configured owner.
  if (!connectionId && process.env["BROWSER_PROVIDER_OWNER_ID"] === userId && process.env[variable])
    return { apiKey: process.env[variable]!, connectionId: null };
  if (connectionId === undefined) {
    const { prepareBrowserVaultConnection } = await import("./browser-vault.server");
    if ((await prepareBrowserVaultConnection(userId, provider)) === "connected")
      return providerCredential(userId, provider);
  }
  throw new Error(
    `Connect ${provider === "browser_use" ? "Browser Use" : "Browserbase"} with your own API key in Connections.`,
  );
}

export const startProviderSchema = z.object({
  provider: providerSchema,
  task: z.string().trim().min(1).max(8000),
  model: z.string().trim().min(1).max(100).optional(),
  modelParams: z.record(z.string(), z.unknown()).optional(),
  spendApproved: z.literal(true),
});
export async function startProvider(userId: string, input: unknown) {
  const data = startProviderSchema.parse(input);
  const { apiKey, connectionId } = await providerCredential(userId, data.provider);
  if (data.provider === "browser_use") {
    const run = await browserUseClient(apiKey).runs.create(
      runBody({
        task: data.task,
        ...(data.model !== undefined ? { model: data.model } : {}),
        ...(data.modelParams !== undefined ? { modelParams: data.modelParams } : {}),
      }),
    );
    return signHandle(apiKey, userId, {
      provider: data.provider,
      connectionId,
      id: run.id,
      sessionId: run.sessionId,
    });
  }
  const session = await browserbaseClient(apiKey).sessions.create({
    api_timeout: 300,
    keepAlive: false,
    proxies: false,
    browserSettings: { solveCaptchas: false, verified: false },
  });
  return signHandle(apiKey, userId, {
    provider: data.provider,
    connectionId,
    id: session.id,
    sessionId: session.id,
  });
}
export async function readProvider(userId: string, input: unknown, stop = false) {
  const data = handleSchema.parse(input);
  const { apiKey } = await providerCredential(userId, data.provider, data.connectionId);
  verifyHandle(apiKey, userId, data);
  if (data.provider === "browser_use") {
    const client = browserUseClient(apiKey);
    if (stop) await client.runs.cancel(data.id);
    return readBrowserUse(client, data.id, data.sessionId);
  }
  const client = browserbaseClient(apiKey);
  if (stop) await client.sessions.update(data.id, { status: "REQUEST_RELEASE" });
  const session = await client.sessions.retrieve(data.id);
  const terminal = ["COMPLETED", "ERROR", "TIMED_OUT"].includes(session.status);
  const view = terminal ? null : await client.sessions.debug(data.id);
  return {
    status: session.status,
    terminal,
    success: false,
    result: null,
    error: null,
    cleanupConfirmed: terminal,
    liveUrl: view?.debuggerFullscreenUrl ?? null,
    costUsd: null,
  };
}

/** Prevent SDK response bodies or transport details from crossing the public boundary. */
export async function publicProviderCall<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch {
    throw new Error(
      "Browser provider operation was not confirmed. Check your connection and provider dashboard before retrying; an unconfirmed create may have started.",
    );
  }
}
