import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { COMMAND_CENTER_HTML } from "./command-center.ts";

type ElementStub = {
  textContent: string;
  className: string;
  style: object;
  children: ElementStub[];
  append(...nodes: ElementStub[]): void;
  replaceChildren(): void;
};
function widget() {
  const element = (): ElementStub => ({
    textContent: "",
    className: "",
    style: {},
    children: [] as ElementStub[],
    append(...nodes: ElementStub[]) {
      this.children.push(...nodes);
    },
    replaceChildren() {
      this.children = [];
    },
  });
  const grid = element(),
    access = element();
  let receive: (event: { data: { method: string; params: unknown } }) => void = () => {};
  vm.runInNewContext(COMMAND_CENTER_HTML.match(/<script>([\s\S]*?)<\/script>/)![1], {
    document: {
      getElementById: (id: string) => (id === "grid" ? grid : access),
      createElement: element,
    },
    window: {
      addEventListener: (_: string, callback: typeof receive) => {
        receive = callback;
      },
    },
  });
  return {
    grid,
    access,
    send: (params: unknown) =>
      receive({ data: { method: "ui/notifications/tool-result", params } }),
  };
}
test("renders JSON text tool results including zero counts without HTML injection", () => {
  const w = widget();
  w.send({
    content: [
      {
        type: "text",
        text: JSON.stringify({
          gateway: "<img onerror=alert(1)>",
          planes: { resources: { published: 86 }, connections: { connected: 0 } },
          scopes: ["resources:read"],
        }),
      },
    ],
  });
  assert.equal(w.grid.children[0].children[1].textContent, "<img onerror=alert(1)>");
  assert.equal(w.grid.children[1].children[1].textContent, "86");
  assert.equal(w.grid.children[2].children[1].textContent, "0");
  assert.equal(w.access.textContent, "Limited access");
  w.send({ content: [{ type: "text", text: "not JSON" }] });
  assert.equal(w.grid.children.length, 4);
});
test("renders structured status and reports the actual control scope", () => {
  const w = widget();
  w.send({ structuredContent: { planes: {}, scopes: ["control:write"] } });
  assert.equal(w.access.textContent, "Control write granted");
  assert.equal(w.grid.children[2].children[1].textContent, "Unavailable");
});
