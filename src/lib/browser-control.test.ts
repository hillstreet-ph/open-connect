import { afterEach, expect, test } from "bun:test";
import {
  BrowserController,
  browserNavigationUrl,
  browserPoint,
  validateCdpUrl,
} from "./browser-control";
const RealSocket = globalThis.WebSocket;
afterEach(() => {
  globalThis.WebSocket = RealSocket;
});

test("only secure provider CDP endpoints can be connected", () => {
  expect(validateCdpUrl("wss://ip-1.tinyfish.io/cdp")).toBe("wss://ip-1.tinyfish.io/cdp");
  for (const url of [
    "ws://ip-1.tinyfish.io/cdp",
    "wss://tinyfish.io.evil.test/cdp",
    "wss://u:p@ip-1.tinyfish.io/cdp",
    "wss://127.0.0.1/cdp",
  ])
    expect(() => validateCdpUrl(url)).toThrow();
});
test("navigation rejects embedded credentials and executable schemes", () => {
  expect(browserNavigationUrl("example.com")).toBe("https://example.com/");
  expect(() => browserNavigationUrl("javascript:alert(1)")).toThrow();
  expect(() => browserNavigationUrl("https://u:p@example.com")).toThrow();
});
test("pointer mapping follows responsive image size and clamps to the viewport", () => {
  const bounds = { left: 10, top: 20, width: 400, height: 300 };
  const frame = { width: 1200, height: 900 };
  expect(browserPoint(210, 170, bounds, frame)).toEqual({ x: 600, y: 450 });
  expect(browserPoint(-20, 1000, bounds, frame)).toEqual({ x: 0, y: 899 });
});
test("CDP attaches to a page, streams frames, sends input and closes cleanly", async () => {
  const sent: Array<{
    method: string;
    params: { type?: string; sessionId?: number | string; targetId?: string };
    sessionId?: string;
  }> = [];
  let instance: FakeSocket;
  class FakeSocket {
    static OPEN = 1;
    readyState = 1;
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    closed = false;
    constructor() {
      // The fixture exposes its socket instance to drive provider events.
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      instance = this;
      queueMicrotask(() => this.onopen?.());
    }
    send(text: string) {
      const message = JSON.parse(text);
      sent.push(message);
      const result =
        message.method === "Page.getNavigationHistory"
          ? { currentIndex: 0, entries: [{ id: 1 }, { id: 2 }] }
          : message.method === "Target.getTargets"
            ? {
                targetInfos: [
                  { type: "page", targetId: "page1", title: "Main", url: "https://example.com" },
                  {
                    type: "page",
                    targetId: "popup",
                    title: "Sign in",
                    url: "https://example.com/login",
                  },
                  { type: "worker", targetId: "worker" },
                ],
              }
            : message.method === "Target.attachToTarget"
              ? { sessionId: message.params.targetId === "popup" ? "popup-attached" : "attached" }
              : {};
      queueMicrotask(() => this.onmessage?.({ data: JSON.stringify({ id: message.id, result }) }));
    }
    close() {
      this.closed = true;
      this.onclose?.();
    }
  }
  globalThis.WebSocket = FakeSocket as unknown as typeof WebSocket;
  const frames: unknown[] = [];
  const browser = new BrowserController(
    (frame) => frames.push(frame),
    () => {},
  );
  await browser.connect("wss://test.tinyfish.io/cdp");
  instance!.onmessage?.({
    data: JSON.stringify({
      method: "Page.screencastFrame",
      sessionId: "attached",
      params: { sessionId: 2, data: "fixture", metadata: { deviceWidth: 1000, deviceHeight: 700 } },
    }),
  });
  await browser.click(30, 40);
  expect(await browser.history(-1)).toBe(false);
  expect(await browser.history(1)).toBe(true);
  await browser.reload();
  expect(sent.some((m) => m.method === "Page.navigateToHistoryEntry")).toBe(true);
  expect(sent.some((m) => m.method === "Page.reload")).toBe(true);
  await browser.text("fixture text");
  await browser.key("Enter", "Enter");
  expect(frames).toEqual([{ data: "fixture", width: 1000, height: 700 }]);
  expect(sent.find((m) => m.method === "Page.screencastFrameAck")?.params).toEqual({
    sessionId: 2,
  });
  expect(
    sent.filter((m) => m.method === "Input.dispatchMouseEvent").map((m) => m.params.type),
  ).toEqual(["mouseMoved", "mousePressed", "mouseReleased"]);
  expect(sent.find((m) => m.method === "Input.insertText")?.sessionId).toBe("attached");
  expect((await browser.tabs()).map((tab) => tab.targetId)).toEqual(["page1", "popup"]);
  await expect(browser.selectTab("closed")).rejects.toThrow("closed");
  expect(browser.activeTabId).toBe("page1");
  await browser.selectTab("popup");
  expect(browser.activeTabId).toBe("popup");
  expect(sent.find((m) => m.method === "Target.detachFromTarget")?.params.sessionId).toBe(
    "attached",
  );
  await browser.text("popup input");
  expect(sent.filter((m) => m.method === "Input.insertText").at(-1)?.sessionId).toBe(
    "popup-attached",
  );
  browser.disconnect();
  expect(browser.activeTabId).toBe("");
  expect(instance!.closed).toBe(true);
  await expect(browser.navigate("example.com")).rejects.toThrow("disconnected");
});
