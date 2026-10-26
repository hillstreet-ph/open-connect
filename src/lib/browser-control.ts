/** Ephemeral, user-operated CDP connection. Never stores URLs, frames or typed text. */
export type BrowserMouseButton = "left" | "right" | "middle";
export type BrowserTab = { targetId: string; title: string; url: string };
export type BrowserFrame = { data: string; width: number; height: number };
type Reply = { result?: Record<string, unknown>; error?: { message?: string } };
export function validateCdpUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "wss:" ||
    url.username ||
    url.password ||
    url.port ||
    !["tinyfish.io", "tinyfish.ai"].some((host) => url.hostname.endsWith(`.${host}`))
  ) {
    throw new Error("The provider did not return a supported secure browser connection.");
  }
  return url.toString();
}
export function browserNavigationUrl(value: string) {
  const url = new URL(
    /^[a-z][a-z0-9+.-]*:/i.test(value.trim()) ? value.trim() : `https://${value.trim()}`,
  );
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
    throw new Error("Use an HTTP(S) URL without embedded credentials.");
  return url.toString();
}
export function browserPoint(
  x: number,
  y: number,
  bounds: { left: number; top: number; width: number; height: number },
  frame: { width: number; height: number },
) {
  if (bounds.width <= 0 || bounds.height <= 0) throw new Error("Browser view is not ready.");
  return {
    x: Math.max(0, Math.min(frame.width - 1, ((x - bounds.left) * frame.width) / bounds.width)),
    y: Math.max(0, Math.min(frame.height - 1, ((y - bounds.top) * frame.height) / bounds.height)),
  };
}
export class BrowserController {
  private socket: WebSocket | null = null;
  private serial = 0;
  private targetSession = "";
  private pointerTail: Promise<void> = Promise.resolve();
  private inputGeneration = 0;
  private queuedMove: {
    x: number;
    y: number;
    buttons: number;
    generation: number;
    promise: Promise<void>;
  } | null = null;
  private pressedPointer: {
    x: number;
    y: number;
    button: BrowserMouseButton;
    count: number;
  } | null = null;
  activeTabId = "";
  private requests = new Map<
    number,
    {
      resolve: (v: Record<string, unknown>) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  constructor(
    private onFrame: (frame: BrowserFrame) => void,
    private onClosed: () => void,
  ) {}
  async connect(url: string) {
    this.disconnect();
    const ws = new WebSocket(validateCdpUrl(url));
    this.socket = ws;
    ws.onmessage = (event) => {
      if (this.socket !== ws) return;
      const msg = JSON.parse(String(event.data));
      const pending = this.requests.get(msg.id);
      if (pending) {
        this.requests.delete(msg.id);
        clearTimeout(pending.timer);
        const reply = msg as Reply;
        if (reply.error)
          pending.reject(new Error(reply.error.message ?? "Browser command failed."));
        else pending.resolve(reply.result ?? {});
      }
      if (msg.method === "Page.screencastFrame" && msg.sessionId === this.targetSession) {
        const p = msg.params;
        this.onFrame({
          data: p.data,
          width: p.metadata.deviceWidth,
          height: p.metadata.deviceHeight,
        });
        void this.command("Page.screencastFrameAck", { sessionId: p.sessionId }).catch(() => {});
      }
    };
    ws.onclose = () => {
      if (this.socket === ws) {
        this.disconnect();
        this.onClosed();
      }
    };
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error("Browser connection timed out. Reconnect the existing session."));
      }, 15000);
      ws.onopen = () => {
        clearTimeout(timer);
        resolve();
      };
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error("Could not connect to the remote browser."));
      };
    });
    const pages = await this.tabs();
    if (!pages.length) throw new Error("No browser tab is available.");
    await this.selectTab(pages[0]!.targetId);
  }
  async tabs(): Promise<BrowserTab[]> {
    const targets = await this.command("Target.getTargets", {}, false);
    return (targets["targetInfos"] as Array<BrowserTab & { type: string }>).filter(
      (target) => target.type === "page",
    );
  }
  async selectTab(targetId: string) {
    this.inputGeneration++;
    await this.pointerTail;
    const pressed = this.pressedPointer;
    if (pressed) await this.release(pressed.x, pressed.y, pressed.button, pressed.count);
    const pages = await this.tabs();
    if (!pages.some((page) => page.targetId === targetId))
      throw new Error("This tab has closed. Refresh the tab list.");
    if (this.targetSession) {
      await this.command("Page.stopScreencast");
      await this.command("Target.detachFromTarget", { sessionId: this.targetSession }, false);
      this.targetSession = "";
    }
    const attached = await this.command(
      "Target.attachToTarget",
      { targetId, flatten: true },
      false,
    );
    this.targetSession = String(attached["sessionId"]);
    this.activeTabId = targetId;
    await this.command("Page.enable");
    await this.command("Page.bringToFront");
    await this.command("Page.startScreencast", {
      format: "jpeg",
      quality: 70,
      maxWidth: 1440,
      maxHeight: 1000,
      everyNthFrame: 1,
    });
  }
  private command(
    method: string,
    params: Record<string, unknown> = {},
    targeted = true,
  ): Promise<Record<string, unknown>> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN)
      return Promise.reject(new Error("Browser is disconnected."));
    const id = ++this.serial;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.requests.delete(id);
        reject(new Error("Browser command timed out."));
      }, 15000);
      this.requests.set(id, { resolve, reject, timer });
      this.socket!.send(
        JSON.stringify({
          id,
          method,
          params,
          ...(targeted && this.targetSession ? { sessionId: this.targetSession } : {}),
        }),
      );
    });
  }
  async navigate(url: string) {
    const result = await this.command("Page.navigate", { url: browserNavigationUrl(url) });
    if (result["errorText"]) throw new Error(String(result["errorText"]));
  }
  async history(direction: -1 | 1) {
    const result = await this.command("Page.getNavigationHistory");
    const entries = (Array.isArray(result["entries"]) ? result["entries"] : []) as Array<{
      id: number;
    }>;
    const entry = entries[Number(result["currentIndex"]) + direction];
    if (!entry) return false;
    await this.command("Page.navigateToHistoryEntry", { entryId: entry.id });
    return true;
  }
  async reload() {
    await this.command("Page.reload");
  }
  async click(x: number, y: number) {
    await this.command("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x,
      y,
      button: "none",
      buttons: 0,
    });
    await this.command("Input.dispatchMouseEvent", {
      type: "mousePressed",
      buttons: 1,
      x,
      y,
      button: "left",
      clickCount: 1,
    });
    await this.command("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      buttons: 0,
      x,
      y,
      button: "left",
      clickCount: 1,
    });
  }
  private pointer(
    type: "mouseMoved" | "mousePressed" | "mouseReleased",
    x: number,
    y: number,
    buttons: number,
    button: BrowserMouseButton | "none",
    clickCount = 0,
    move?: { x: number; y: number; buttons: number },
  ) {
    if (![x, y].every((value) => Number.isFinite(value) && value >= 0))
      return Promise.reject(new Error("Invalid pointer position."));
    const generation = this.inputGeneration;
    const target = this.targetSession;
    const pending = this.pointerTail.then(async () => {
      if (move && this.queuedMove === move) this.queuedMove = null;
      const point = move ?? { x, y, buttons };
      if (!target || generation !== this.inputGeneration || target !== this.targetSession)
        throw new Error("Browser target changed. Focus the current tab again.");
      await this.command("Input.dispatchMouseEvent", {
        type,
        x: point.x,
        y: point.y,
        buttons: point.buttons,
        button,
        ...(clickCount ? { clickCount } : {}),
      });
      if (type === "mousePressed" && button !== "none")
        this.pressedPointer = { x, y, button, count: clickCount };
      else if (type === "mouseReleased") this.pressedPointer = null;
      else if (this.pressedPointer) {
        this.pressedPointer.x = point.x;
        this.pressedPointer.y = point.y;
      }
    });
    this.pointerTail = pending.catch(() => {});
    return pending;
  }
  move(x: number, y: number, buttons = 0) {
    if (![x, y].every((value) => Number.isFinite(value) && value >= 0))
      return Promise.reject(new Error("Invalid pointer position."));
    if (
      this.queuedMove?.generation === this.inputGeneration &&
      this.queuedMove.buttons === buttons
    ) {
      this.queuedMove.x = x;
      this.queuedMove.y = y;
      return this.queuedMove.promise;
    }
    const move = { x, y, buttons, generation: this.inputGeneration, promise: Promise.resolve() };
    move.promise = this.pointer(
      "mouseMoved",
      x,
      y,
      buttons,
      buttons === 1 ? "left" : buttons === 2 ? "right" : buttons === 4 ? "middle" : "none",
      0,
      move,
    );
    this.queuedMove = move;
    return move.promise;
  }
  press(x: number, y: number, button: BrowserMouseButton = "left", clickCount = 1) {
    this.queuedMove = null;
    return this.pointer(
      "mousePressed",
      x,
      y,
      button === "left" ? 1 : button === "right" ? 2 : 4,
      button,
      clickCount,
    );
  }
  release(x: number, y: number, button: BrowserMouseButton = "left", clickCount = 1) {
    this.queuedMove = null;
    return this.pointer("mouseReleased", x, y, 0, button, clickCount);
  }
  async scroll(x: number, y: number, deltaY: number) {
    await this.command("Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX: 0, deltaY });
  }
  async text(text: string) {
    if (text.length > 50000)
      throw new Error("Text is too large. Paste at most 50,000 characters at a time.");
    if (text) await this.command("Input.insertText", { text });
  }
  async key(key: string, code: string, modifiers = 0) {
    const virtualKeys: Record<string, number> = {
      Enter: 13,
      Tab: 9,
      Backspace: 8,
      Delete: 46,
      Escape: 27,
      ArrowLeft: 37,
      ArrowUp: 38,
      ArrowRight: 39,
      ArrowDown: 40,
      Home: 36,
      End: 35,
      PageUp: 33,
      PageDown: 34,
    };
    await this.command("Input.dispatchKeyEvent", {
      type: "rawKeyDown",
      key,
      code,
      modifiers,
      windowsVirtualKeyCode: virtualKeys[key] ?? key.toUpperCase().charCodeAt(0),
      ...(modifiers & 6 && key.toLowerCase() === "a" ? { commands: ["selectAll"] } : {}),
    });
    await this.command("Input.dispatchKeyEvent", { type: "keyUp", key, code, modifiers });
  }
  disconnect() {
    this.queuedMove = null;
    this.inputGeneration++;
    this.pointerTail = Promise.resolve();
    this.pressedPointer = null;
    const socket = this.socket;
    this.socket = null;
    this.targetSession = "";
    this.activeTabId = "";
    socket?.close();
    for (const pending of this.requests.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Browser disconnected."));
    }
    this.requests.clear();
  }
}
