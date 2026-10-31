import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { COMMAND_CENTER_HTML } from "./command-center.ts";

type ElementStub = {
  textContent: string;
  value: string;
  className: string;
  style: object;
  hidden: boolean;
  disabled: boolean;
  attrs: Record<string, string>;
  children: ElementStub[];
  events: Record<string, () => Promise<void>>;
  append(...nodes: ElementStub[]): void;
  replaceChildren(): void;
  setAttribute(k: string, v: string): void;
  addEventListener(k: string, cb: () => Promise<void>): void;
};
function widget(openai: object = {}) {
  const elements = new Map<string, ElementStub>();
  function element(): ElementStub {
    return {
      textContent: "",
      value: "",
      className: "",
      style: {},
      hidden: false,
      disabled: true,
      attrs: {} as Record<string, string>,
      children: [] as ElementStub[],
      events: {} as Record<string, () => Promise<void>>,
      append(...nodes: ElementStub[]) {
        this.children.push(...nodes);
      },
      replaceChildren() {
        this.children = [];
      },
      setAttribute(k: string, v: string) {
        this.attrs[k] = v;
      },
      addEventListener(k: string, cb: () => Promise<void>) {
        this.events[k] = cb;
      },
    };
  }
  for (const id of [
    "grid",
    "auto",
    "status",
    "retry",
    "goal",
    "discover",
    "team",
    "results",
    "scopes",
    "access",
    "worker-status",
    "preset",
    "suggestions",
    "session-status",
  ])
    elements.set(id, element());
  const listeners = new Map<string, (e: object) => void>();
  const requests: {
    id: string | number;
    method: string;
    params: { name?: string; arguments?: object };
  }[] = [];
  const timers = new Map<number, () => void>();
  let timerId = 0;
  const parent = {
    postMessage(m: (typeof requests)[number]) {
      requests.push(m);
    },
  };
  vm.runInNewContext(COMMAND_CENTER_HTML.match(/<script>([\s\S]*?)<\/script>/i)![1]!, {
    document: { getElementById: (id: string) => elements.get(id), createElement: element },
    window: {
      parent,
      openai,
      addEventListener: (name: string, cb: (e: object) => void) => listeners.set(name, cb),
    },
    setTimeout: (cb: () => void) => {
      timers.set(++timerId, cb);
      return timerId;
    },
    clearTimeout: (id: number) => timers.delete(id),
  });
  return {
    grid: elements.get("grid")!,
    toggle: elements.get("auto")!,
    status: elements.get("status")!,
    retry: elements.get("retry")!,
    requests,
    goal: elements.get("goal")!,
    discover: elements.get("discover")!,
    team: elements.get("team")!,
    results: elements.get("results")!,
    access: elements.get("access")!,
    scopeText: elements.get("scopes")!,
    workerStatus: elements.get("worker-status")!,
    preset: elements.get("preset")!,
    suggestions: elements.get("suggestions")!,
    sessionStatus: elements.get("session-status")!,
    reject: (id: string | number, message: string) =>
      listeners.get("message")!({
        source: parent,
        data: { jsonrpc: "2.0", id, error: { message } },
      }),
    reply: (id: string | number, result: unknown) =>
      listeners.get("message")!({ source: parent, data: { jsonrpc: "2.0", id, result } }),
    send: (params: unknown, trusted = true) =>
      listeners.get("message")!({
        source: trusted ? parent : {},
        data: { jsonrpc: "2.0", method: "ui/notifications/tool-result", params },
      }),
    globals: (globals: unknown) => listeners.get("openai:set_globals")!({ detail: { globals } }),
    expire: () => {
      const callbacks = [...timers.values()];
      timers.clear();
      callbacks.forEach((cb) => cb());
    },
  };
}
const status = {
  gateway: "<img onerror=alert(1)>",
  planes: { resources: { published: 86 }, connections: { connected: 0 } },
  scopes: ["tools:invoke"],
  auto: { enabled: true },
};
test("compact widget links to real destinations and reflects worker permissions and Auto state", () => {
  const w = widget();
  w.send({
    structuredContent: {
      ...status,
      scopes: ["resources:read", "models:invoke", "agents:invoke"],
      auto: { enabled: true, scope: "personal" },
    },
  });
  assert.match(w.workerStatus.textContent, /model worker · Auto On/);
  assert.match(w.status.textContent, /Auto discovery · Auto On/);
  assert.deepEqual(
    w.grid.children.map((c) => c.attrs["href"]),
    ["/library", "/connections", "/secrets", "/models", "/resources", "/ai-agency"].map(
      (p) => "https://open-connect.site" + p,
    ),
  );
  w.send({
    structuredContent: { ...status, scopes: [], auto: { enabled: true, scope: "personal" } },
  });
  assert.match(w.workerStatus.textContent, /Not granted/);
  w.send({ structuredContent: { auto: { enabled: false } } });
  assert.match(w.workerStatus.textContent, /Auto Off/);
  assert.match(w.status.textContent, /Auto discovery · Auto Off/);
});
async function flush() {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}
async function connect(w: ReturnType<typeof widget>) {
  assert.equal(w.requests[0]!.method, "ui/initialize");
  w.reply(w.requests[0]!.id, {});
  await flush();
  const call = w.requests.find((r) => r.method === "tools/call")!;
  assert.equal(call.params.name, "open_connect_status");
  w.reply(call.id, { structuredContent: status });
  await flush();
}
test("starter prompts fill the goal without executing tools", () => {
  const w = widget();
  const before = w.requests.length;
  for (const preset of ["discover", "task", "maintain"]) {
    w.preset.value = preset;
    w.preset.events["change"]!();
    assert.ok(w.goal.value.length > 50);
    assert.equal(w.requests.length, before);
  }
});
test("discovery recommends editable follow-ups without executing or marking the goal complete", async () => {
  const w = widget();
  await connect(w);
  w.send({ structuredContent: { ...status, scopes: ["resources:read"] } });
  w.goal.value = "Review my project";
  const task = w.discover.events["click"]!();
  await flush();
  w.reply(w.requests.at(-1)!.id, {
    structuredContent: { matches: [{ name: "Project tools", description: "Available" }] },
  });
  await task;
  assert.match(w.sessionStatus.textContent, /Discovery complete.*not executed/);
  assert.equal(w.suggestions.children.length, 3);
  const before = w.requests.length;
  await w.suggestions.children[0]!.events["click"]!();
  assert.match(w.goal.value, /Review my project/);
  assert.equal(w.requests.length, before);
});
test("initializes the bridge, preserves zero counts, and renders values as text", async () => {
  const w = widget();
  await connect(w);
  assert.equal(w.toggle.textContent, "Auto On");
  assert.equal(w.toggle.attrs["aria-checked"], "true");
  assert.equal(w.toggle.disabled, false);
  assert.equal(w.grid.children[0]!.children[0]!.textContent, "Resources");
  assert.equal(w.grid.children[1]!.children[1]!.textContent, "0");
  assert.deepEqual(
    w.grid.children.map((c) => c.children[0]!.textContent),
    ["Resources", "Connections", "Credentials", "AI Gateway", "Marketplace", "AI Agency"],
  );
  assert.equal(w.grid.children[2]!.children[1]!.textContent, "Not granted");
  w.send({ content: [{ type: "text", text: "bad JSON" }] });
  assert.equal(w.grid.children.length, 6);
});
test("ignores foreign frames and handles legacy globals and metadata envelopes", () => {
  const w = widget();
  w.send({ structuredContent: status }, false);
  assert.equal(w.grid.children.length, 0);
  w.globals({
    toolResponseMetadata: {
      call_tool_result: { content: [{ type: "text", text: JSON.stringify(status) }] },
    },
  });
  assert.equal(w.toggle.textContent, "Auto On");
});
test("times out with retry instead of waiting indefinitely", async () => {
  const w = widget();
  w.expire();
  await flush();
  assert.match(w.status.textContent, /did not respond/);
  assert.equal(w.retry.hidden, false);
  assert.equal(w.toggle.disabled, true);
  const task = w.retry.events["click"]!();
  const init = w.requests.filter((r) => r.method === "ui/initialize").at(-1)!;
  w.reply(init.id, {});
  await flush();
  const call = w.requests.filter((r) => r.method === "tools/call").at(-1)!;
  w.reply(call.id, { structuredContent: status });
  await task;
  assert.equal(w.toggle.textContent, "Auto On");
});
test("saves toggle through the scoped tool and retains previous state on failure", async () => {
  const w = widget();
  await connect(w);
  let task = w.toggle.events["click"]!();
  await flush();
  const call = w.requests.at(-1)!;
  assert.equal(call.params.name, "set_auto_mode");
  assert.equal(JSON.stringify(call.params.arguments), '{"enabled":false}');
  w.reply(call.id, { structuredContent: { auto: { enabled: false } } });
  await task;
  assert.equal(w.toggle.textContent, "Auto Off");
  task = w.toggle.events["click"]!();
  await flush();
  w.reply(w.requests.at(-1)!.id, { isError: true, content: [{ type: "text", text: "Denied" }] });
  await task;
  assert.equal(w.toggle.textContent, "Auto Off");
  assert.match(w.status.textContent, /not saved/);
});
test("shows unavailable settings for legacy server and disables writes for read-only scope", () => {
  const w = widget();
  w.send({ structuredContent: { planes: {}, scopes: ["mcp:connect"] } });
  assert.equal(w.toggle.disabled, true);
  assert.equal(w.retry.hidden, false);
  w.send({ structuredContent: { ...status, scopes: ["resources:read"] } });
  assert.equal(w.toggle.disabled, true);
});

test("legacy callTool also times out so pending host calls cannot leave a permanent spinner", async () => {
  const w = widget({ callTool: () => new Promise(() => {}) });
  w.expire();
  await flush();
  w.expire();
  await flush();
  assert.equal(w.retry.hidden, false);
  assert.match(w.status.textContent, /host did not respond/);
});

test("goal actions respect grants and render matching and worker results as text", async () => {
  const w = widget();
  await connect(w);
  w.goal.value = "Review the UI";
  const before = w.requests.length;
  await w.discover.events["click"]!();
  assert.equal(w.requests.length, before);
  w.send({
    structuredContent: {
      ...status,
      scopes: ["tools:invoke", "resources:read", "models:invoke", "agents:invoke"],
      auto: { enabled: true, scope: "personal" },
    },
  });
  let task = w.discover.events["click"]!();
  await flush();
  let call = w.requests.at(-1)!;
  assert.equal(call.params.name, "auto_discover");
  w.reply(call.id, {
    structuredContent: {
      matches: [{ name: "<script>alert(1)</script>", description: "Safe text" }],
    },
  });
  await task;
  assert.ok(w.results.textContent.includes("<script>"));
  task = w.team.events["click"]!();
  await flush();
  call = w.requests.at(-1)!;
  assert.equal(call.params.name, "run_agent_team");
  w.reply(call.id, {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          workers: [
            { role: "Planner", status: "completed", model: "test:free", content: "First" },
            { role: "Reviewer", status: "completed", model: "test:free", content: "Second" },
          ],
        }),
      },
    ],
  });
  await task;
  assert.ok(w.results.textContent.includes("First\n\nReviewer"));
  w.send({ structuredContent: { ...status, auto: { enabled: false, scope: "personal" } } });
  assert.equal(w.team.disabled, true);
});

test("prefers the standard bridge even when legacy callTool exists", async () => {
  let legacyCalls = 0;
  const w = widget({
    callTool: () => {
      legacyCalls++;
      throw new Error("Unknown tool");
    },
  });
  await connect(w);
  assert.equal(legacyCalls, 0);
  assert.equal(typeof w.requests[0]!.id, "number");
});
test("unwraps nested host action responses and reports stale tools without replay", async () => {
  const w = widget();
  await connect(w);
  w.send({
    structuredContent: {
      ...status,
      scopes: ["resources:read", "models:invoke", "agents:invoke"],
      auto: { enabled: true, scope: "personal" },
    },
  });
  w.goal.value = "Plan a task";
  let task = w.discover.events["click"]!();
  await flush();
  w.reply(w.requests.at(-1)!.id, {
    result: {
      toolOutput: {
        content: [
          {
            type: "text",
            text: JSON.stringify({ matches: [{ name: "Available tool", description: "Matched" }] }),
          },
        ],
      },
    },
  });
  await task;
  assert.match(w.results.textContent, /Available tool/);
  task = w.team.events["click"]!();
  await flush();
  const count = w.requests.length;
  w.reject(w.requests.at(-1)!.id, "Unknown tool");
  await task;
  assert.match(w.results.textContent, /outdated Open-Connect tool list/);
  assert.equal(w.requests.length, count);
  assert.equal(w.team.disabled, false);
});
test("explains empty goals and unavailable discovery instead of reporting no match", async () => {
  const w = widget();
  await connect(w);
  w.send({ structuredContent: { ...status, scopes: ["resources:read"] } });
  await w.discover.events["click"]!();
  assert.match(w.results.textContent, /Enter a goal/);
  w.goal.value = "Find tools";
  const task = w.discover.events["click"]!();
  await flush();
  w.reply(w.requests.at(-1)!.id, { structuredContent: { status: "unavailable" } });
  await task;
  assert.match(w.results.textContent, /discovery is unavailable/);
});

test("legacy-only hosts fall back after a rejected handshake, before any tool invocation", async () => {
  const calls: string[] = [];
  const w = widget({
    callTool: async (name: string) => {
      calls.push(name);
      return { structuredContent: status };
    },
  });
  w.reject(w.requests[0]!.id, "Method not found");
  await flush();
  assert.deepEqual(calls, ["open_connect_status"]);
  assert.equal(w.toggle.textContent, "Auto On");
});
test("returned error envelopes never appear as an empty capability match", async () => {
  const w = widget();
  await connect(w);
  w.send({ structuredContent: { ...status, scopes: ["resources:read"] } });
  w.goal.value = "Find tools";
  const task = w.discover.events["click"]!();
  await flush();
  w.reply(w.requests.at(-1)!.id, { toolOutput: { error: { message: "Unknown tool" } } });
  await task;
  assert.match(w.results.textContent, /outdated Open-Connect tool list/);
});

test("credential and model cards show numeric totals, preserve zero, and distinguish unavailable reads", () => {
  const w = widget();
  w.send({
    structuredContent: {
      ...status,
      planes: {
        ...status.planes,
        credentials: { available: true, count: 42 },
        models: { available: true, count: 712 },
      },
    },
  });
  assert.equal(w.grid.children[2]!.children[1]!.textContent, "42");
  assert.equal(w.grid.children[3]!.children[1]!.textContent, "712");
  w.send({
    structuredContent: {
      ...status,
      planes: { credentials: { available: true, count: 0 }, models: { available: true, count: 0 } },
    },
  });
  assert.equal(w.grid.children[2]!.children[1]!.textContent, "0");
  assert.equal(w.grid.children[3]!.children[1]!.textContent, "0");
  w.send({
    structuredContent: {
      ...status,
      planes: {
        credentials: { available: true, count: null },
        models: { available: false, count: null },
      },
    },
  });
  assert.equal(w.grid.children[2]!.children[1]!.textContent, "Unavailable");
  assert.equal(w.grid.children[3]!.children[1]!.textContent, "Not granted");
});

test("access summary uses readable labels while exact scopes remain available separately", () => {
  const w = widget();
  w.send({
    structuredContent: {
      ...status,
      scopes: ["agents:invoke", "control:write"],
      auto: { enabled: true, scope: "personal" },
    },
  });
  assert.match(w.access.textContent, /AI worker permission: granted/);
  assert.match(w.access.textContent, /Workspace control permission: granted/);
  assert.doesNotMatch(w.access.textContent, /agents:invoke|control:write/);
  assert.equal(w.scopeText.textContent, "agents:invoke, control:write");
  w.send({
    structuredContent: { ...status, scopes: [], auto: { enabled: true, scope: "personal" } },
  });
  assert.match(w.access.textContent, /AI worker permission: not granted/);
  assert.match(w.access.textContent, /Workspace control permission: not granted/);
});
