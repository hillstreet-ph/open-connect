import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listPlaywrightTools,
  callPlaywrightTool,
  runPlaywrightTask,
  cancelPlaywrightTask,
  startPlaywrightSignIn,
  endPlaywrightSignIn,
} from "@/lib/playwright.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type Tool = { name: string; description?: string; inputSchema?: unknown };

export function PlaywrightBrowser({
  initialGoal = "",
  onActiveChange,
  onTaskComplete,
}: {
  initialGoal?: string | undefined;
  onActiveChange?: ((active: boolean) => void) | undefined;
  onTaskComplete?: (() => void) | undefined;
} = {}) {
  const list = useServerFn(listPlaywrightTools);
  const call = useServerFn(callPlaywrightTool);
  const task = useServerFn(runPlaywrightTask);
  const startSignIn = useServerFn(startPlaywrightSignIn);
  const endSignIn = useServerFn(endPlaywrightSignIn);
  const [signInUrl, setSignInUrl] = useState("");
  const viewer = useMutation({ mutationFn: () => startSignIn({ data: { url: signInUrl } }) });
  const endViewer = useMutation({
    mutationFn: () => endSignIn({}),
    onSuccess: () => viewer.reset(),
  });
  const manual = viewer.isSuccess;
  const cancelTask = useServerFn(cancelPlaywrightTask);
  const cancellation = useMutation({ mutationFn: () => cancelTask({}) });
  const [goal, setGoal] = useState(initialGoal);
  const agent = useMutation({
    mutationFn: () => task({ data: { goal } }),
    onMutate: () => cancellation.reset(),
    onSuccess: () => onTaskComplete?.(),
  });
  const [name, setName] = useState("browser_navigate");
  const [args, setArgs] = useState('{"url":"https://example.com"}');
  const catalog = useQuery({
    queryKey: ["playwright-tools"],
    queryFn: () => list({}),
    retry: false,
  });
  const tools = (catalog.data?.tools ?? []) as Tool[];
  const selected = tools.find((tool) => tool.name === name);
  const execution = useMutation({
    mutationFn: async (override?: { name: string; arguments: Record<string, unknown> }) => {
      const parsed: unknown = override?.arguments ?? JSON.parse(args);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error("Enter a JSON object.");
      return call({
        data: { name: override?.name ?? name, arguments: parsed as Record<string, unknown> },
      });
    },
  });
  const active = manual || viewer.isPending || agent.isPending || execution.isPending;
  useEffect(() => {
    onActiveChange?.(active);
    return () => onActiveChange?.(false);
  }, [active, onActiveChange]);
  return (
    <section className="space-y-4 rounded-xl border p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Playwright MCP</h2>
        <Button
          variant="outline"
          disabled={catalog.isFetching || execution.isPending || agent.isPending}
          onClick={() => void catalog.refetch()}
        >
          Refresh connection
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        One browser engine for every task. Your session stays separate from other users and closes
        after 15 minutes without activity. Close the browser when finished.
      </p>
      {catalog.isSuccess ? (
        <p className="text-xs text-muted-foreground">
          {catalog.data.profileMode === "persistent"
            ? "Saved sign-ins are enabled for your separate browser profile."
            : "Temporary session: sign-ins are cleared after the worker session ends."}
        </p>
      ) : null}
      {catalog.isLoading ? <p role="status">Connecting to Playwright…</p> : null}
      {catalog.isError ? <p role="alert">{catalog.error.message}</p> : null}
      {catalog.isSuccess ? (
        <>
          {catalog.data.liveViewEnabled ? (
            <div className="space-y-3 rounded-lg border p-4">
              <h3 className="font-medium">Private sign-in</h3>
              <p className="text-sm text-muted-foreground">
                Open the website and sign in directly with your mouse and keyboard. Agent control
                pauses until you finish. Passwords stay out of task prompts.
              </p>
              {!manual ? (
                <>
                  <Label htmlFor="browser-signin-url">Website address</Label>
                  <input
                    id="browser-signin-url"
                    type="url"
                    className="w-full rounded border bg-background p-2"
                    placeholder="https://example.com/login"
                    value={signInUrl}
                    disabled={agent.isPending || viewer.isPending}
                    onChange={(event) => setSignInUrl(event.target.value)}
                  />
                  <Button
                    disabled={
                      agent.isPending ||
                      execution.isPending ||
                      viewer.isPending ||
                      !signInUrl.trim()
                    }
                    onClick={() => viewer.mutate()}
                  >
                    {viewer.isPending ? "Opening…" : "Open private browser"}
                  </Button>
                </>
              ) : (
                <>
                  <iframe
                    title="Private browser sign-in"
                    src={viewer.data.url}
                    className="h-[38rem] w-full rounded border"
                    sandbox="allow-scripts allow-same-origin"
                    referrerPolicy="no-referrer"
                    onLoad={(event) =>
                      event.currentTarget.contentWindow?.postMessage(
                        { viewToken: viewer.data.token },
                        new URL(viewer.data.url).origin,
                      )
                    }
                  />
                  <p className="text-xs">
                    This view expires after ten minutes. Finish sign-in to let the agent continue.
                  </p>
                  <Button disabled={endViewer.isPending} onClick={() => endViewer.mutate()}>
                    {endViewer.isPending ? "Finishing…" : "Finish sign-in"}
                  </Button>
                </>
              )}
              {viewer.isError ? <p role="alert">{viewer.error.message}</p> : null}
              {endViewer.isError ? <p role="alert">{endViewer.error.message}</p> : null}
            </div>
          ) : null}
          <Label htmlFor="playwright-goal">Browser task</Label>
          <Textarea
            id="playwright-goal"
            placeholder="Open example.com and tell me the page title"
            value={goal}
            disabled={agent.isPending || execution.isPending}
            onChange={(event) => setGoal(event.target.value)}
          />
          <Button
            disabled={
              manual || viewer.isPending || agent.isPending || execution.isPending || !goal.trim()
            }
            onClick={() => agent.mutate()}
          >
            {agent.isPending ? "Working…" : "Run task"}
          </Button>
          {agent.isPending ? (
            <Button
              variant="destructive"
              disabled={cancellation.isPending || cancellation.isSuccess}
              onClick={() => cancellation.mutate()}
            >
              {cancellation.isPending
                ? "Stopping…"
                : cancellation.isSuccess
                  ? "Stopped"
                  : "Stop task"}
            </Button>
          ) : null}
          {cancellation.isError ? <p role="alert">{cancellation.error.message}</p> : null}
          <p className="text-xs text-muted-foreground">
            Uses your connected free model and up to eight Playwright actions. Never enter passwords
            here.
          </p>
          {agent.isError ? <p role="alert">{agent.error.message}</p> : null}
          {agent.isSuccess ? (
            <div role="status">
              <p>{agent.data.reply}</p>
              {(agent.data.artifacts ?? []).map(
                (item: { data: string; mimeType: string }, index: number) => (
                  <img
                    key={index}
                    alt="Browser task screenshot"
                    className="w-full rounded-lg border"
                    src={`data:${item.mimeType};base64,${item.data}`}
                  />
                ),
              )}
              <p className="text-xs">
                {agent.data.status} · {agent.data.actions.length} browser actions
                {agent.data.history_saved ? " · Saved to history" : " · History could not be saved"}
              </p>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {[
              ["Snapshot", "browser_snapshot"],
              ["Screenshot", "browser_take_screenshot"],
              ["Back", "browser_navigate_back"],
            ].map(([label, action]) => (
              <Button
                key={action}
                variant="outline"
                disabled={manual || viewer.isPending || execution.isPending || agent.isPending}
                onClick={() =>
                  execution.mutate({
                    name: action!,
                    arguments: action === "browser_take_screenshot" ? { type: "png" } : {},
                  })
                }
              >
                {label}
              </Button>
            ))}
          </div>
          <details className="space-y-3">
            <summary className="cursor-pointer text-sm">Advanced browser actions</summary>
            <Label htmlFor="playwright-tool">Browser action</Label>
            <select
              id="playwright-tool"
              className="w-full rounded-md border bg-background p-2"
              value={name}
              disabled={manual || viewer.isPending || execution.isPending || agent.isPending}
              onChange={(event) => {
                setName(event.target.value);
                setArgs(
                  event.target.value === "browser_navigate"
                    ? '{"url":"https://example.com"}'
                    : "{}",
                );
                execution.reset();
              }}
            >
              {tools.map((tool) => (
                <option key={tool.name} value={tool.name}>
                  {tool.name.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            <p className="text-sm">{selected?.description}</p>
            <details>
              <summary>Action arguments</summary>
              <pre className="overflow-auto text-xs">
                {JSON.stringify(selected?.inputSchema, null, 2)}
              </pre>
            </details>
            <Label htmlFor="playwright-arguments">Arguments (JSON)</Label>
            <Textarea
              id="playwright-arguments"
              value={args}
              disabled={manual || viewer.isPending || execution.isPending || agent.isPending}
              onChange={(event) => setArgs(event.target.value)}
              className="min-h-28 font-mono"
            />
            <Button
              disabled={
                manual || viewer.isPending || execution.isPending || agent.isPending || !selected
              }
              onClick={() => execution.mutate(undefined)}
            >
              {execution.isPending ? "Running…" : "Run action"}
            </Button>
          </details>
          <Button
            className="ml-2"
            variant="outline"
            disabled={manual || viewer.isPending || execution.isPending || agent.isPending}
            onClick={() => {
              execution.mutate({ name: "browser_close", arguments: {} });
            }}
          >
            Close browser
          </Button>
        </>
      ) : null}
      {execution.isError ? <p role="alert">{execution.error.message}</p> : null}
      {execution.isSuccess
        ? (execution.data.content ?? [])
            .filter((item: { type: string }) => item.type === "image")
            .map((item: { data: string; mimeType: string }, index: number) => (
              <img
                key={index}
                alt="Current browser screenshot"
                className="w-full rounded-lg border"
                src={`data:${item.mimeType};base64,${item.data}`}
              />
            ))
        : null}
      {execution.isSuccess ? (
        <pre
          role="status"
          className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs"
        >
          {JSON.stringify(
            {
              ...execution.data,
              content: (execution.data.content ?? []).filter(
                (item: { type: string }) => item.type !== "image",
              ),
            },
            null,
            2,
          )}
        </pre>
      ) : null}
    </section>
  );
}
