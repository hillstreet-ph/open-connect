import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { createDirectCloudBrowser, finishDirectCloudBrowser } from "@/lib/cloud-browser.functions";
import { BrowserController, browserPoint, type BrowserFrame } from "@/lib/browser-control";
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
  const [frame, setFrame] = useState<BrowserFrame | null>(null);
  const [url, setUrl] = useState("https://example.com");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const textInput = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
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
  const connect = async (current: Session) => {
    controller.current?.disconnect();
    setFrame(null);
    setReady(false);
    const client = new BrowserController(setFrame, () => {
      setReady(false);
      setFrame(null);
      setMessage("Connection closed. Reconnect this session or close it.");
    });
    controller.current = client;
    await client.connect(current.cdpUrl);
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
            {frame ? (
              <img
                tabIndex={0}
                role="application"
                aria-label="Interactive remote browser. Click to focus, type to enter text, Tab to move between remote fields. Escape exits the remote view."
                alt="Live remote browser page"
                src={`data:image/jpeg;base64,${frame.data}`}
                draggable={false}
                className="w-full rounded border bg-black focus:ring-2 focus:ring-primary"
                onClick={(event) => {
                  event.currentTarget.focus();
                  const point = browserPoint(
                    event.clientX,
                    event.clientY,
                    event.currentTarget.getBoundingClientRect(),
                    frame,
                  );
                  void controller.current?.click(point.x, point.y).catch(report);
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
                    event.currentTarget.blur();
                    return;
                  }
                  event.preventDefault();
                  if (["Shift", "Control", "Alt", "Meta"].includes(event.key)) return;
                  const client = controller.current;
                  const modifiers =
                    (event.altKey ? 1 : 0) |
                    (event.ctrlKey ? 2 : 0) |
                    (event.metaKey ? 4 : 0) |
                    (event.shiftKey ? 8 : 0);
                  void (
                    event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey
                      ? client?.text(event.key)
                      : client?.key(event.key, event.code, modifiers)
                  )?.catch(report);
                }}
                onPaste={(event) => {
                  event.preventDefault();
                  void controller.current?.text(event.clipboardData.getData("text")).catch(report);
                }}
              />
            ) : (
              <p className="rounded border bg-muted p-8 text-center text-sm" role="status">
                {ready ? "Waiting for browser image…" : "Connecting to remote browser…"}
              </p>
            )}
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
            <div className="flex flex-wrap gap-2">
              {["Tab", "Enter", "Backspace", "ArrowUp", "ArrowDown"].map((key) => (
                <Button
                  key={key}
                  size="sm"
                  variant="outline"
                  disabled={!ready || busy}
                  onClick={() => void controller.current?.key(key, key).catch(report)}
                >
                  {key}
                </Button>
              ))}
            </div>
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
