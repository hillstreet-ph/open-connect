import { parse, type DefaultTreeAdapterTypes } from "parse5";
import { describe, expect, test } from "bun:test";
import {
  createTinyFishClient,
  normalizeStartRun,
  normalizeProfileInput,
  startRunBody,
  startRunWithLiveView,
  summarizeRun,
  requiresBrowserSignIn,
  TINYFISH_BROWSER_API,
  type TinyFishRun,
} from "./tinyfish";
import { CLOUD_BROWSER_FRAME_DOMAINS, CLOUD_BROWSER_WIDGET_HTML } from "./cloud-browser-widget";

const KEY = "sk-tinyfish-test-key";

function run(overrides: Partial<TinyFishRun> = {}): TinyFishRun {
  return {
    run_id: "run-1",
    status: "RUNNING",
    goal: "Check page",
    created_at: "2026-10-24T00:00:00Z",
    started_at: null,
    finished_at: null,
    num_of_steps: null,
    result: null,
    error: null,
    streaming_url: null,
    ...overrides,
  };
}

function mockFetch(routes: Record<string, (init: RequestInit) => unknown>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const send = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    const key = Object.keys(routes).find((prefix) => url.startsWith(prefix));
    if (!key) return new Response(JSON.stringify({ error: { message: "nf" } }), { status: 404 });
    return new Response(JSON.stringify(routes[key]!(init)), { status: 200 });
  }) as typeof fetch;
  return { send, calls };
}

describe("normalizeStartRun", () => {
  test("defaults to saved sign-ins and adds https", () => {
    const input = normalizeStartRun({ url: "web.telegram.org", goal: " Check chats " });
    expect(input).toEqual({
      url: "https://web.telegram.org/",
      goal: "Check chats",
      use_profile: true,
    });
  });

  test("honours fresh browser, profile id, stealth and proxy", () => {
    expect(
      normalizeStartRun({ url: "https://a.com", goal: "x", use_profile: false }).use_profile,
    ).toBe(false);
    const input = normalizeStartRun({
      url: "https://a.com",
      goal: "x",
      use_profile: false,
      profile_id: "prof_abc",
      stealth: true,
      proxy_country_code: "ph",
    });
    expect(startRunBody(input)).toEqual({
      url: "https://a.com/",
      goal: "x",
      api_integration: "open-connect",
      use_profile: true,
      profile_id: "prof_abc",
      browser_profile: "stealth",
      proxy_config: { enabled: true, country_code: "PH" },
    });
  });

  test("explicitly disables saved sign-ins for a fresh browser", () => {
    expect(
      startRunBody(
        normalizeStartRun({
          url: "https://example.com",
          goal: "Check page",
          use_profile: false,
        }),
      ).use_profile,
    ).toBe(false);
  });

  test("rejects credentials in URLs, bad schemes and empty goals", () => {
    expect(() => normalizeStartRun({ url: "https://u:p@a.com", goal: "x" })).toThrow();
    expect(() => normalizeStartRun({ url: "javascript:alert(1)", goal: "x" })).toThrow();
    expect(() => normalizeStartRun({ url: "https://a.com", goal: "  " })).toThrow();
    expect(() =>
      normalizeStartRun({ url: "https://a.com", goal: "x", profile_id: "../x" }),
    ).toThrow();
  });
});

describe("TinyFish client", () => {
  test("sends the key only to TinyFish and starts async runs", async () => {
    const { send, calls } = mockFetch({
      "https://agent.tinyfish.ai/v1/automation/run-async": () => ({ run_id: "r1", error: null }),
    });
    const client = createTinyFishClient(KEY, send);
    const started = await client.startRun(normalizeStartRun({ url: "https://a.com", goal: "x" }));
    expect(started.run_id).toBe("r1");
    expect(calls[0]!.init.method).toBe("POST");
    expect((calls[0]!.init.headers as Record<string, string>)["X-API-Key"]).toBe(KEY);
    expect(
      calls.every((call) => call.url.startsWith("https://") && call.url.includes("tinyfish.ai")),
    ).toBe(true);
  });

  test("creates and updates named profiles without exposing cookie values", async () => {
    const { send, calls } = mockFetch({
      "https://agent.tinyfish.ai/v1/profiles": () => ({ id: "prof_work", name: "Work" }),
    });
    const client = createTinyFishClient(KEY, send);
    await client.createProfile({ name: " Work ", set_as_default: true });
    await client.updateProfile("prof_work", { name: "Work updated" });
    expect(calls[0]!.init.method).toBe("POST");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ name: "Work", set_as_default: true });
    expect(calls[1]!.url).toBe("https://agent.tinyfish.ai/v1/profiles/prof_work");
    expect(calls[1]!.init.method).toBe("PATCH");
    expect(() => client.updateProfile("../other", { name: "Work" })).toThrow();
    expect(calls.length).toBe(2);
  });

  test("rejects empty and oversized profile names before sending requests", () => {
    expect(() => normalizeProfileInput({ name: "   " })).toThrow();
    expect(() => normalizeProfileInput({ name: "x".repeat(101) })).toThrow();
  });

  test("profile setup validates URLs and saves or cancels the exact session", async () => {
    const { send, calls } = mockFetch({
      "https://agent.tinyfish.ai/v1/profiles/": () => ({
        session_id: "sess_1",
        domains_updated: ["example.com"],
      }),
    });
    const client = createTinyFishClient(KEY, send);
    await client.startProfileSetup("prof_work", "https://example.com/login");
    await client.finishProfileSetup("prof_work", "sess_1", "save");
    await client.finishProfileSetup("prof_work", "sess_1", "cancel");
    expect(calls.map((call) => new URL(call.url).pathname)).toEqual([
      "/v1/profiles/prof_work/setup-session",
      "/v1/profiles/prof_work/save",
      "/v1/profiles/prof_work/setup-session/cancel",
    ]);
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      url: "https://example.com/login",
      timeout_seconds: 900,
    });
    expect(JSON.parse(String(calls[1]!.init.body))).toEqual({ session_id: "sess_1" });
    expect(() =>
      client.startProfileSetup("prof_work", "https://user:secret@example.com"),
    ).toThrow();
    expect(() => client.finishProfileSetup("prof_work", "../other", "save")).toThrow();
    expect(calls.length).toBe(3);
  });

  test("allows sixty seconds for browser startup while keeping reads bounded", async () => {
    const originalTimeout = AbortSignal.timeout;
    const timeouts: number[] = [];
    AbortSignal.timeout = (ms: number) => {
      timeouts.push(ms);
      return originalTimeout(ms);
    };
    try {
      const { send } = mockFetch({
        [`${TINYFISH_BROWSER_API}/`]: () => ({ session_id: "br-1" }),
        "https://agent.tinyfish.ai/v1/profiles": () => ({ profiles: [] }),
      });
      const client = createTinyFishClient(KEY, send);
      await client.createBrowserSession({ url: "https://example.com", timeout_seconds: 60 });
      await client.listProfiles();
      await client.startProfileSetup("prof_work", "https://example.com");
      expect(timeouts).toEqual([60000, 25000, 60000]);
    } finally {
      AbortSignal.timeout = originalTimeout;
    }
  });

  test("browser sessions use the Browser API host", async () => {
    const { send, calls } = mockFetch({
      [`${TINYFISH_BROWSER_API}/`]: () => ({ session_id: "br-1", cdp_url: "wss://x" }),
    });
    const client = createTinyFishClient(KEY, send);
    await client.createBrowserSession({ url: "https://a.com" });
    expect(calls[0]!.url).toBe(`${TINYFISH_BROWSER_API}/`);
  });

  test("rejects unsafe run ids before any request", () => {
    const client = createTinyFishClient(KEY, mockFetch({}).send);
    expect(() => client.getRun("../wallet")).toThrow();
  });

  test("retries a transient status failure without starting a second run", async () => {
    let starts = 0;
    let polls = 0;
    const { send } = mockFetch({
      "https://agent.tinyfish.ai/v1/automation/run-async": () => {
        starts += 1;
        return { run_id: "r1", error: null };
      },
      "https://agent.tinyfish.ai/v1/runs/r1": () => {
        if (++polls === 1) throw new Error("Temporary network failure");
        return run({ run_id: "r1", streaming_url: "https://live.tinyfish.io/stream" });
      },
    });
    const result = await startRunWithLiveView(
      createTinyFishClient(KEY, send),
      normalizeStartRun({ url: "https://example.com", goal: "Check page" }),
      { sleep: async () => {}, waitMs: 5000 },
    );
    expect(starts).toBe(1);
    expect(polls).toBe(2);
    expect(result.streaming_url).toBe("https://live.tinyfish.io/stream");
  });

  test("startRunWithLiveView returns the streaming URL once available", async () => {
    let polls = 0;
    const { send } = mockFetch({
      "https://agent.tinyfish.ai/v1/automation/run-async": () => ({ run_id: "r1", error: null }),
      "https://agent.tinyfish.ai/v1/runs/r1": () => {
        polls += 1;
        return run({
          run_id: "r1",
          streaming_url:
            polls >= 2 ? "https://ip-1.tetra-data.production.tinyfish.io/tf-1/stream/0" : null,
        });
      },
    });
    const view = await startRunWithLiveView(
      createTinyFishClient(KEY, send),
      normalizeStartRun({ url: "https://a.com", goal: "x" }),
      { sleep: async () => {}, intervalMs: 0, waitMs: 5000 },
    );
    expect(view.streaming_url).toContain("tinyfish.io");
    expect(polls).toBe(2);
  });
});

test("completed sign-in diagnostics are not shown as authenticated success", () => {
  expect(requiresBrowserSignIn({ authenticated: false })).toBe(true);
  expect(requiresBrowserSignIn({ result: { authenticated: false } })).toBe(true);
  expect(requiresBrowserSignIn({ authenticated: true })).toBe(false);
  expect(requiresBrowserSignIn("authentication failed")).toBe(false);
});

describe("summarizeRun", () => {
  test("bounds output and marks terminal runs", () => {
    const summary = summarizeRun(
      run({
        status: "COMPLETED",
        goal: "g".repeat(900),
        result: { result: "ok" },
        steps: [{ id: "1", action: "Click", status: "COMPLETED", timestamp: "t" }],
      }),
    );
    expect(summary.terminal).toBe(true);
    expect(summary.goal.length).toBeLessThan(510);
    expect(summary.recent_actions).toEqual(["Click"]);
  });
});

describe("cloud browser widget", () => {
  test("frames only TinyFish and Open-Connect, and polls via MCP tools", () => {
    expect(CLOUD_BROWSER_FRAME_DOMAINS.every((domain) => domain.startsWith("https://"))).toBe(true);
    expect(CLOUD_BROWSER_WIDGET_HTML).toContain("cloud_browser_get_run");
    expect(CLOUD_BROWSER_WIDGET_HTML).toContain("[hidden]{display:none!important}");
    expect(CLOUD_BROWSER_WIDGET_HTML).toContain("SIGN-IN REQUIRED");
    const script = widgetScript();
    expect(() => new Function(script)).not.toThrow();
    expect(CLOUD_BROWSER_WIDGET_HTML).not.toContain("X-API-Key");
  });
});

test("finished legacy task cards collapse the preview and untrusted frame origins are rejected", async () => {
  const { runInNewContext } = await import("node:vm");
  class Element {
    hidden = false;
    className = "";
    textContent = "";
    src = "";
    href = "";
    disabled = false;
    removeAttribute(name: string) {
      if (name === "src") this.src = "";
    }
  }
  const elements = new Map<string, Element>();
  const get = (id: string) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id)!;
  };
  const context = {
    URL,
    document: { getElementById: get },
    window: {
      openai: {
        callTool: async () => ({}),
        toolOutput: {
          run_id: "fixture",
          status: "COMPLETED",
          result: { heading: "IANA" },
          view_url: "javascript:alert(1)",
        },
      },
      parent: { postMessage: () => {} },
      addEventListener: () => {},
    },
    setTimeout: () => 1,
    clearTimeout: () => {},
  };
  const script = widgetScript();
  runInNewContext(script, context);
  expect(get("frame").className).toContain("ended");
  expect(get("out").hidden).toBe(false);
  expect(get("out").textContent).toContain("IANA");
  expect(get("open").hidden).toBe(true);
  runInNewContext(
    "render({run_id:'fixture',status:'RUNNING',streaming_url:'https://untrusted.example/view'})",
    context,
  );
  expect(get("view").hidden).toBe(true);
  expect(get("full").hidden).toBe(true);
});

function widgetScript(): string {
  function visit(node: DefaultTreeAdapterTypes.Node): string | undefined {
    if ("tagName" in node && node.tagName === "script")
      return node.childNodes.map((child) => ("value" in child ? child.value : "")).join("");
    if ("childNodes" in node) {
      for (const child of node.childNodes) {
        const script = visit(child);
        if (script !== undefined) return script;
      }
    }
  }
  const script = visit(parse(CLOUD_BROWSER_WIDGET_HTML));
  if (!script) throw new Error("Widget script missing");
  return script;
}
