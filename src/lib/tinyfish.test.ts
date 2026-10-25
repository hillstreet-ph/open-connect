import { describe, expect, test } from "bun:test";
import {
  createTinyFishClient,
  normalizeStartRun,
  startRunBody,
  startRunWithLiveView,
  summarizeRun,
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
    expect(CLOUD_BROWSER_WIDGET_HTML).not.toContain("X-API-Key");
  });
});
