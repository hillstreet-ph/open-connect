import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { COMMAND_CENTER_HTML } from "./command-center.ts";

type ElementStub = {
  textContent: string;
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
  for (const id of ["grid", "auto", "status", "retry"]) elements.set(id, element());
  const listeners = new Map<string, (e: object) => void>();
  const requests: { id: string; method: string; params: { name?: string; arguments?: object } }[] =
    [];
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
    reply: (id: string, result: unknown) =>
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
test("initializes the bridge, preserves zero counts, and renders values as text", async () => {
  const w = widget();
  await connect(w);
  assert.equal(w.toggle.textContent, "Auto On");
  assert.equal(w.toggle.attrs["aria-checked"], "true");
  assert.equal(w.toggle.disabled, false);
  assert.equal(w.grid.children[0]!.children[1]!.textContent, "<img onerror=alert(1)>");
  assert.equal(w.grid.children[2]!.children[1]!.textContent, "0");
  w.send({ content: [{ type: "text", text: "bad JSON" }] });
  assert.equal(w.grid.children.length, 3);
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
  const call = w.requests.at(-1)!;
  assert.equal(call.params.name, "set_auto_mode");
  assert.equal(JSON.stringify(call.params.arguments), '{"enabled":false}');
  w.reply(call.id, { structuredContent: { auto: { enabled: false } } });
  await task;
  assert.equal(w.toggle.textContent, "Auto Off");
  task = w.toggle.events["click"]!();
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
