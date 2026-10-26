import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createDirectCloudBrowser, finishDirectCloudBrowser } from "@/lib/cloud-browser.functions";
import {
  BrowserController,
  browserPoint,
  type BrowserTab,
  type BrowserFrame,
  type BrowserMouseButton,
} from "@/lib/browser-control";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

type Session = { sessionId: string; cdpUrl: string; profileId: string | null };
export function DirectCloudBrowser({
  profileId,
  onSaved,
  onActiveChange,
}: {
  profileId?: string | undefined;
  onSaved: () => void;
  onActiveChange: (active: boolean) => void;
}) {
  const create = useServerFn(createDirectCloudBrowser);
  const finish = useServerFn(finishDirectCloudBrowser);
  const controller = useRef<BrowserController | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  }, [finish]);
  const [session, setSession] = useState<Session | null>(null);
  const [tabs, setTabs] = useState<BrowserTab[]>([]);
  const [activeTab, setActiveTab] = useState("");
  const [frame, setFrame] = useState<BrowserFrame | null>(null);
  const [url, setUrl] = useState("https://example.com");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const textInput = useRef<HTMLInputElement>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const pointer = useRef<{
    button: BrowserMouseButton;
    count: number;
    x: number;
    y: number;
    time: number;
  } | null>(null);
  const lastPress = useRef<{
    button: BrowserMouseButton;
    x: number;
    y: number;
    time: number;
    count: number;
  } | null>(null);
  const moveFrame = useRef<number | null>(null);
  const pendingMove = useRef<{ x: number; y: number } | null>(null);
  const flushMove = () => {
    if (moveFrame.current !== null) cancelAnimationFrame(moveFrame.current);
    moveFrame.current = null;
    const point = pendingMove.current;
    pendingMove.current = null;
    if (point)
      void controller.current
        ?.move(
          point.x,
          point.y,
          pointer.current
            ? pointer.current.button === "left"
              ? 1
              : pointer.current.button === "right"
                ? 2
                : 4
            : 0,
        )
        .catch(report);
  };
  useEffect(
    () => () => {
      if (moveFrame.current !== null) cancelAnimationFrame(moveFrame.current);
      controller.current?.disconnect();
      const current = sessionRef.current;
      if (current)
        void finishRef
          .current({
            data: { sessionId: current.sessionId, profileId: current.profileId, save: false },
          })
          .catch(() => {});
    },
    [],
  );
  const report = (failure: unknown) =>
    setError(failure instanceof Error ? failure.message : "Browser action failed.");
  const releasePointer = () => {
    const pressed = pointer.current;
    if (!pressed) return;
    flushMove();
    pointer.current = null;
    void controller.current
      ?.release(pressed.x, pressed.y, pressed.button, pressed.count)
      .catch(report);
  };
  const connect = async (current: Session) => {
    controller.current?.disconnect();
    setFrame(null);
    setCursor(null);
    pointer.current = null;
    setReady(false);
    const client = new BrowserController(setFrame, () => {
      setReady(false);
      setFrame(null);
      setMessage("Connection closed. Reconnect this session or close it.");
    });
    controller.current = client;
    await client.connect(current.cdpUrl);
    setTabs(await client.tabs());
    setActiveTab(client.activeTabId);
    setReady(true);
  };
  const start = async () => {
    setBusy(true);
    setError("");
    setMessage("Starting remote Chrome. This can take up to a minute…");
    try {
      const current = await create({ data: { url, ...(profileId ? { profileId } : {}) } });
      sessionRef.current = current;
      onActiveChange(true);
      setSession(current);
      await connect(current);
      setMessage("Connected. Click the remote page to focus a field, then type or paste.");
    } catch (failure) {
      report(failure);
      setMessage(
        "A timed-out creation may still be running. Do not retry repeatedly. Sessions expire after inactivity; profile setup expires after 15 minutes.",
      );
    } finally {
      setBusy(false);
    }
  };
  const close = async (save: boolean) => {
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      const result = await finish({
        data: { sessionId: session.sessionId, profileId: session.profileId, save },
      });
      controller.current?.disconnect();
      controller.current = null;
      sessionRef.current = null;
      setSession(null);
      onActiveChange(false);
      setFrame(null);
      setReady(false);
      setMessage(
        result.domainsFailed.length
          ? `Saved with failures for: ${result.domainsFailed.join(", ")}. Review the profile before relying on it.`
          : save
            ? "Profile state saved. Test a new agent task to confirm the sign-in works."
            : "Browser closed. Unsaved setup state discarded.",
      );
      if (save) onSaved();
    } catch (failure) {
      report(failure);
      setMessage("Closure was not confirmed. Retry Close; the session may still be running.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Direct browser control</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Control a separate remote Chrome with clicks, scrolling and typing.{" "}
          {profileId
            ? "The selected profile receives login state only when you choose Save profile and close."
            : "This is a fresh temporary browser. Select a saved profile above to set up reusable sign-ins."}
        </p>
        <Label htmlFor="direct-url">Website address</Label>
        <div className="flex flex-wrap gap-2">
          <Input
            id="direct-url"
            className="min-w-0 flex-1"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          {session ? (
            <Button
              disabled={!ready || busy}
              onClick={() => {
                setError("");
                void controller.current?.navigate(url).catch(report);
              }}
            >
              Go
            </Button>
          ) : (
            <Button disabled={busy || !url.trim()} onClick={() => void start()}>
              {busy ? "Starting…" : "Open browser"}
            </Button>
          )}
        </div>
        {session ? (
          <>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={!ready || busy}
                onClick={() => void controller.current?.history(-1).catch(report)}
              >
                Back
              </Button>
              <Button
                variant="outline"
                disabled={!ready || busy}
                onClick={() => void controller.current?.history(1).catch(report)}
              >
                Forward
              </Button>
              <Button
                variant="outline"
                disabled={!ready || busy}
                onClick={() => void controller.current?.reload().catch(report)}
              >
                Reload
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  setError("");
                  void connect(session)
                    .catch(report)
                    .finally(() => setBusy(false));
                }}
              >
                Reconnect view
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => void close(false)}>
                Close without saving
              </Button>
              {session.profileId ? (
                <Button disabled={busy || !ready} onClick={() => void close(true)}>
                  Save profile and close
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="direct-tab">Browser tab</Label>
              <select
                id="direct-tab"
                className="min-w-0 max-w-full rounded border bg-background px-2 py-2 text-sm"
                value={activeTab}
                disabled={!ready || busy}
                onChange={(event) => {
                  const id = event.target.value;
                  setBusy(true);
                  setError("");
                  flushMove();
                  pointer.current = null;
                  setCursor(null);
                  setFrame(null);
                  void controller.current
                    ?.selectTab(id)
                    .then(() => setActiveTab(id))
                    .catch(report)
                    .finally(() => setBusy(false));
                }}
              >
                {tabs.map((tab) => (
                  <option key={tab.targetId} value={tab.targetId}>
                    {tab.title || "Untitled tab"}
                  </option>
                ))}
              </select>
              <Button
                variant="outline"
                disabled={!ready || busy}
                onClick={() => {
                  setError("");
                  void controller.current?.tabs().then(setTabs).catch(report);
                }}
              >
                Refresh tabs
              </Button>
              <span className="text-xs text-muted-foreground">
                Refresh after opening a sign-in popup, then select its tab.
              </span>
            </div>
            {frame ? (
              <div className="relative">
                <img
                  tabIndex={0}
                  role="application"
                  aria-label="Interactive remote browser. Move, click or drag the pointer. Type or paste into the focused field. Escape closes a remote menu and exits keyboard capture."
                  alt="Live remote browser page"
                  src={`data:image/jpeg;base64,${frame.data}`}
                  draggable={false}
                  className="w-full touch-none rounded border bg-black focus:ring-2 focus:ring-primary"
                  onContextMenu={(event) => event.preventDefault()}
                  onBlur={releasePointer}
                  onLostPointerCapture={releasePointer}
                  onPointerMove={(event) => {
                    const point = browserPoint(
                      event.clientX,
                      event.clientY,
                      event.currentTarget.getBoundingClientRect(),
                      frame,
                    );
                    if (
                      pointer.current &&
                      lastPress.current &&
                      Math.hypot(point.x - lastPress.current.x, point.y - lastPress.current.y) > 5
                    )
                      lastPress.current = null;
                    if (pointer.current) {
                      pointer.current.x = point.x;
                      pointer.current.y = point.y;
                    }
                    setCursor({
                      x: (point.x / frame.width) * 100,
                      y: (point.y / frame.height) * 100,
                    });
                    pendingMove.current = point;
                    if (moveFrame.current === null)
                      moveFrame.current = requestAnimationFrame(flushMove);
                  }}
                  onPointerLeave={() => {
                    if (!pointer.current) setCursor(null);
                  }}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    if (!event.isPrimary || event.button > 2 || pointer.current) return;
                    event.currentTarget.focus();
                    flushMove();
                    const point = browserPoint(
                      event.clientX,
                      event.clientY,
                      event.currentTarget.getBoundingClientRect(),
                      frame,
                    );
                    const button: BrowserMouseButton =
                      event.button === 2 ? "right" : event.button === 1 ? "middle" : "left";
                    const previous = lastPress.current;
                    const count =
                      previous &&
                      previous.button === button &&
                      event.timeStamp - previous.time < 500 &&
                      Math.hypot(point.x - previous.x, point.y - previous.y) < 5 &&
                      previous.count === 1
                        ? 2
                        : 1;
                    const press = { ...point, button, count, time: event.timeStamp };
                    pointer.current = press;
                    lastPress.current = { ...press };
                    event.currentTarget.setPointerCapture(event.pointerId);
                    void controller.current?.press(point.x, point.y, button, count).catch(report);
                  }}
                  onPointerUp={(event) => {
                    const press = pointer.current;
                    if (!press) return;
                    flushMove();
                    pointer.current = null;
                    const point = browserPoint(
                      event.clientX,
                      event.clientY,
                      event.currentTarget.getBoundingClientRect(),
                      frame,
                    );
                    void controller.current
                      ?.release(point.x, point.y, press.button, press.count)
                      .catch(report);
                    if (event.currentTarget.hasPointerCapture(event.pointerId))
                      event.currentTarget.releasePointerCapture(event.pointerId);
                  }}
                  onPointerCancel={() => {
                    lastPress.current = null;
                    const press = pointer.current;
                    flushMove();
                    pointer.current = null;
                    if (press)
                      void controller.current
                        ?.release(press.x, press.y, press.button, press.count)
                        .catch(report);
                    setCursor(null);
                  }}
                  onWheel={(event) => {
                    const point = browserPoint(
                      event.clientX,
                      event.clientY,
                      event.currentTarget.getBoundingClientRect(),
                      frame,
                    );
                    void controller.current?.scroll(point.x, point.y, event.deltaY).catch(report);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      void controller.current?.key("Escape", "Escape").catch(report);
                      event.currentTarget.blur();
                      return;
                    }
                    // Let the local paste event deliver clipboard text to onPaste.
                    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") return;
                    event.preventDefault();
                    if (["Shift", "Control", "Alt", "Meta"].includes(event.key)) return;
                    const client = controller.current;
                    const modifiers =
                      (event.altKey ? 1 : 0) |
                      (event.ctrlKey ? 2 : 0) |
                      (event.metaKey ? 4 : 0) |
                      (event.shiftKey ? 8 : 0);
                    void (
                      Array.from(event.key).length === 1 &&
                      !event.ctrlKey &&
                      !event.metaKey &&
                      !event.altKey
                        ? client?.text(event.key)
                        : client?.key(event.key, event.code, modifiers)
                    )?.catch(report);
                  }}
                  onPaste={(event) => {
                    event.preventDefault();
                    void controller.current
                      ?.text(event.clipboardData.getData("text"))
                      .catch(report);
                  }}
                />
                {cursor ? (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary shadow"
                    style={{ left: `${cursor.x}%`, top: `${cursor.y}%` }}
                  />
                ) : null}
              </div>
            ) : (
              <p className="rounded border bg-muted p-8 text-center text-sm" role="status">
                {ready ? "Waiting for browser image…" : "Connecting to remote browser…"}
              </p>
            )}
            <div className="flex flex-wrap gap-2" aria-label="Remote keyboard controls">
              {[
                "Tab",
                "Enter",
                "Backspace",
                "Escape",
                "ArrowUp",
                "ArrowDown",
                "ArrowLeft",
                "ArrowRight",
                "Delete",
              ].map((key) => (
                <Button
                  key={key}
                  variant="outline"
                  disabled={!ready || busy}
                  onClick={() => void controller.current?.key(key, key).catch(report)}
                >
                  {key}
                </Button>
              ))}
              <Button
                variant="outline"
                disabled={!ready || busy}
                onClick={() => void controller.current?.key("a", "KeyA", 2).catch(report)}
              >
                Select all
              </Button>
              <Button
                variant="outline"
                disabled={!ready || busy}
                onClick={async () => {
                  try {
                    const client = controller.current;
                    const target = client?.activeTabId;
                    const revision = client?.inputRevision;
                    const sessionId = sessionRef.current?.sessionId;
                    const text = await navigator.clipboard.readText();
                    if (
                      !client ||
                      client !== controller.current ||
                      target !== client.activeTabId ||
                      revision !== client.inputRevision ||
                      sessionId !== sessionRef.current?.sessionId
                    )
                      throw new Error("Browser target changed.");
                    await client.text(text);
                  } catch {
                    setError(
                      "Clipboard paste was unavailable. Use keyboard paste or the masked text field below.",
                    );
                  }
                }}
              >
                Paste clipboard
              </Button>
            </div>
            <form
              className="space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                const field = textInput.current;
                if (field && controller.current) {
                  const value = field.value;
                  field.value = "";
                  void controller.current.text(value).catch(report);
                }
              }}
            >
              <Label htmlFor="direct-text">
                Type into the focused remote field (mobile friendly)
              </Label>
              <div className="flex gap-2">
                <Input
                  id="direct-text"
                  ref={textInput}
                  type="password"
                  autoComplete="off"
                  placeholder="Text is masked and cleared after sending"
                  disabled={!ready || busy}
                />
                <Button disabled={!ready || busy} type="submit">
                  Send text
                </Button>
              </div>
            </form>

            <p className="text-xs text-muted-foreground">
              Use the website's normal login flow. Complete verification yourself when requested.
              Typed text and private connection details are not added to run history or local
              storage. This browser is metered while running. Keep this page open until saving or
              closing.
            </p>
          </>
        ) : null}
        {message ? (
          <p role="status" className="text-sm text-muted-foreground">
            {message}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
