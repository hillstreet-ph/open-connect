import { describe, expect, test } from "bun:test";
import { BrowserUse } from "browser-use-sdk/v4";
import {
  runBody,
  signHandle,
  verifyHandle,
  readBrowserUse,
  browserUseClient,
} from "./browser-providers.server";
const id = "00000000-0000-4000-8000-000000000001";
const sessionId = "00000000-0000-4000-8000-000000000002";
describe("additional browser provider safety", () => {
  test("omits model defaults, preserves explicit model parameters and enforces one dollar", () => {
    expect(runBody({ task: "Read example.com" })).toEqual({
      task: "Read example.com",
      maxCostUsd: 1,
      keepAlive: 120,
    });
    const explicit = runBody({
      task: "Read",
      model: "compatible-bedrock-model",
      modelParams: {},
      maxCostUsd: 0.25,
    });
    expect(explicit.model).toBe("compatible-bedrock-model");
    expect(explicit.modelParams).toEqual({});
    expect(() => runBody({ task: "Read", maxCostUsd: 1.01 })).toThrow();
    expect(() => runBody({ task: "Read", maxCostUsd: 0 })).toThrow();
  });
  test("signed references reject cross-account, changed provider, session and run IDs", () => {
    const handle = signHandle("server-secret", "owner", {
      provider: "browser_use",
      connectionId: null,
      id,
      sessionId,
    });
    expect(() => verifyHandle("server-secret", "owner", handle)).not.toThrow();
    for (const [user, modified] of [
      ["other", handle],
      ["owner", { ...handle, id: sessionId }],
      ["owner", { ...handle, sessionId: id }],
      ["owner", { ...handle, provider: "browserbase" }],
    ] as const)
      expect(() => verifyHandle("server-secret", user, modified)).toThrow();
    expect(() => verifyHandle("rotated-secret", "owner", handle)).toThrow();
  });
  test("actual SDK sends V4 with cap and does not retry an ambiguous create", async () => {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async (request: RequestInfo | URL, init?: RequestInit) => {
      calls++;
      expect(String(request)).toContain("/api/v4/runs");
      const headers = new Headers(init?.headers);
      expect(headers.get("X-Browser-Use-API-Key")).toBe("test-only-key");
      const body = JSON.parse(String(init?.body));
      expect(body.maxCostUsd).toBe(1);
      expect("model" in body).toBe(false);
      expect("modelParams" in body).toBe(false);
      throw new TypeError("connection lost after sending create");
    }) as typeof fetch;
    try {
      await expect(
        browserUseClient("test-only-key").runs.create(runBody({ task: "Read" })),
      ).rejects.toThrow();
      expect(calls).toBe(1);
    } finally {
      globalThis.fetch = original;
    }
  });
  test("reads minimal status, validates completion, stops only the matching session browser", async () => {
    const stopped: string[] = [];
    const client = {
      runs: {
        status: async () => ({ status: "completed" }),
        get: async () => ({ status: "completed", result: "Example Domain", totalCostUsd: "0.02" }),
      },
      browsers: {
        list: async () => ({
          items: [
            { id, agentSessionId: sessionId },
            { id: "foreign", agentSessionId: "other" },
          ],
          totalItems: 2,
        }),
        stop: async (id: string) => {
          stopped.push(id);
          return { status: "stopped" };
        },
      },
    } as unknown as Pick<BrowserUse, "runs" | "browsers">;
    const result = await readBrowserUse(client, id, sessionId);
    expect(result.success).toBe(true);
    expect(result.cleanupConfirmed).toBe(true);
    expect(stopped).toEqual([id]);
    expect(result.liveUrl).toBeNull();
  });
  test("running status is not success and never stops an active task browser", async () => {
    let fetched = false,
      stopped = false;
    const client = {
      runs: {
        status: async () => ({ status: "running" }),
        get: async () => {
          fetched = true;
        },
      },
      browsers: {
        list: async () => ({ items: [], totalItems: 0 }),
        stop: async () => {
          stopped = true;
        },
      },
    } as unknown as Pick<BrowserUse, "runs" | "browsers">;
    const result = await readBrowserUse(client, id, sessionId);
    expect(result.success).toBe(false);
    expect(result.terminal).toBe(false);
    expect(stopped).toBe(false);
    expect(fetched).toBe(false);
  });
});

test("public error boundary never returns upstream secret-bearing bodies", async () => {
  const { publicProviderCall } = await import("./browser-providers.server");
  try {
    await publicProviderCall(async () => {
      throw new Error("upstream body contains credential fixture-secret");
    });
    throw new Error("Expected failure");
  } catch (error) {
    expect(String(error)).not.toContain("fixture-secret");
    expect(String(error)).toContain("not confirmed");
  }
});

test("Browserbase SDK infers project and maps the five-minute timeout without paid extras", async () => {
  const { browserbaseClient } = await import("./browser-providers.server");
  let body: Record<string, unknown> = {};
  const send = (async (request: RequestInfo | URL, init?: RequestInit) => {
    expect(String(request)).toContain("/v1/sessions");
    body = JSON.parse(String(init?.body));
    return Response.json({ id, status: "RUNNING" });
  }) as typeof fetch;
  await browserbaseClient("fixture-browserbase-key", send).sessions.create({
    api_timeout: 300,
    proxies: false,
    keepAlive: false,
    browserSettings: { solveCaptchas: false, verified: false },
  });
  expect(body["timeout"]).toBe(300);
  expect("projectId" in body).toBe(false);
  expect(body["proxies"]).toBe(false);
  expect(body["keepAlive"]).toBe(false);
  expect(body["browserSettings"]).toEqual({ solveCaptchas: false, verified: false });
});

test("an accepted stop response is not cleanup confirmation until the browser reports stopped", async () => {
  const client = {
    runs: {
      status: async () => ({ status: "completed" }),
      get: async () => ({ result: "", output: null }),
    },
    browsers: {
      list: async () => ({ items: [{ id, agentSessionId: sessionId }], totalItems: 1 }),
      stop: async () => ({ status: "active" }),
    },
  } as unknown as Pick<BrowserUse, "runs" | "browsers">;
  const result = await readBrowserUse(client, id, sessionId);
  expect(result.success).toBe(false);
  expect(result.cleanupConfirmed).toBe(false);
});

test("polling continues after task completion until browser cleanup is confirmed", async () => {
  const { providerPollInterval } = await import("./browser-provider-status");
  expect(providerPollInterval(undefined)).toBe(5000);
  expect(providerPollInterval({ terminal: false, cleanupConfirmed: false })).toBe(5000);
  expect(providerPollInterval({ terminal: true, cleanupConfirmed: false })).toBe(5000);
  expect(providerPollInterval({ terminal: true, cleanupConfirmed: true })).toBe(false);
  expect(providerPollInterval(undefined, true)).toBe(false);
});

test("provider selection rejects unknown URL values and isolates provider/account references", async () => {
  const { browserProvider, providerStorageKey } = await import("./browser-provider-selection");
  expect(browserProvider("browserbase")).toBe("browserbase");
  expect(browserProvider("javascript:alert(1)")).toBe("tinyfish");
  expect(providerStorageKey("owner", "browser_use")).not.toBe(
    providerStorageKey("owner", "browserbase"),
  );
  expect(providerStorageKey("owner", "browser_use")).not.toBe(
    providerStorageKey("other", "browser_use"),
  );
});
test("saved broker connections are not incorrectly marked as native SDK credentials", async () => {
  const { providerConnectionStatus } = await import("./browser-provider-selection");
  const rows = [
    {
      provider: "browser_use",
      status: "connected",
      credential_reference: "composio://connected-account/example",
    },
  ];
  expect(providerConnectionStatus("browser_use", rows)).toEqual({
    configured: false,
    native: false,
    brokered: true,
  });
  expect(
    providerConnectionStatus("browserbase", [
      {
        provider: "browserbase",
        status: "configured_unverified",
        credential_reference: "credential://fixture",
      },
    ]).configured,
  ).toBe(false);
  expect(providerConnectionStatus("browserbase", [], true).configured).toBe(true);
});
test("legacy session recovery moves only its provider and cannot resurrect after clearing", async () => {
  const { restoreProviderReference, providerStorageKey } =
    await import("./browser-provider-selection");
  const values = new Map([
    ["oc-browser-provider:owner", JSON.stringify({ provider: "browser_use", id: "fixture" })],
  ]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  expect(restoreProviderReference(storage, "owner", "browserbase")).toBeNull();
  expect(values.has("oc-browser-provider:owner")).toBe(true);
  expect(
    restoreProviderReference<{ provider: string; id: string }>(storage, "owner", "browser_use"),
  ).toEqual({
    provider: "browser_use",
    id: "fixture",
  });
  expect(values.has("oc-browser-provider:owner")).toBe(false);
  storage.removeItem(providerStorageKey("owner", "browser_use"));
  expect(
    restoreProviderReference<{ provider: string; id: string }>(storage, "owner", "browser_use"),
  ).toBeNull();
});

test("browser tool families retain distinct choices and filter unrelated tools", async () => {
  const { browserProvider, browserFamilyTool, CHROME_DEVTOOLS_TOOLS } =
    await import("./browser-provider-selection");
  for (const provider of ["playwright", "stagehand", "chrome_devtools"] as const)
    expect(browserProvider(provider)).toBe(provider);
  expect(browserFamilyTool("playwright", "browser_snapshot")).toBe(true);
  expect(browserFamilyTool("playwright", "delete_database")).toBe(false);
  expect(browserFamilyTool("stagehand", "stagehand_extract")).toBe(true);
  expect(browserFamilyTool("chrome_devtools", "performance_start_trace")).toBe(true);
  expect(browserFamilyTool("chrome_devtools", "list_network_requests")).toBe(true);
  expect(browserFamilyTool("chrome_devtools", "create_payment")).toBe(false);
  for (const tool of CHROME_DEVTOOLS_TOOLS)
    expect(browserFamilyTool("chrome_devtools", tool)).toBe(true);
  for (const name of ["search", "fetch", "run_research", "list_monitors"])
    expect(browserFamilyTool("tinyfish", name)).toBe(true);
});
