import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listPlaywrightTools,
  callPlaywrightTool,
  runPlaywrightTask,
} from "@/lib/playwright.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type Tool = { name: string; description?: string; inputSchema?: unknown };

export function PlaywrightBrowser() {
  const list = useServerFn(listPlaywrightTools);
  const call = useServerFn(callPlaywrightTool);
  const task = useServerFn(runPlaywrightTask);
  const [goal, setGoal] = useState("");
  const agent = useMutation({ mutationFn: () => task({ data: { goal } }) });
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
    mutationFn: async () => {
      const parsed: unknown = JSON.parse(args);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error("Enter a JSON object.");
      return call({ data: { name, arguments: parsed as Record<string, unknown> } });
    },
  });
  return (
    <section className="space-y-4 rounded-xl border p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">Playwright MCP</h2>
        <Button
          variant="outline"
          disabled={catalog.isFetching || execution.isPending}
          onClick={() => void catalog.refetch()}
        >
          Refresh connection
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        One browser engine for every task. Your session stays separate from other users and closes
        after 15 minutes without activity. Close the browser when finished.
      </p>
      {catalog.isLoading ? <p role="status">Connecting to Playwright…</p> : null}
      {catalog.isError ? <p role="alert">{catalog.error.message}</p> : null}
      {catalog.isSuccess ? (
        <>
          <Label htmlFor="playwright-goal">Browser task</Label>
          <Textarea
            id="playwright-goal"
            placeholder="Open example.com and tell me the page title"
            value={goal}
            disabled={agent.isPending || execution.isPending}
            onChange={(event) => setGoal(event.target.value)}
          />
          <Button
            disabled={agent.isPending || execution.isPending || !goal.trim()}
            onClick={() => agent.mutate()}
          >
            {agent.isPending ? "Working…" : "Run task"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Uses your connected free model and up to eight Playwright actions. Never enter passwords
            here.
          </p>
          {agent.isError ? <p role="alert">{agent.error.message}</p> : null}
          {agent.isSuccess ? (
            <div role="status">
              <p>{agent.data.reply}</p>
              <p className="text-xs">
                {agent.data.status} · {agent.data.actions.length} browser actions
              </p>
            </div>
          ) : null}
          <Label htmlFor="playwright-tool">Browser action</Label>
          <select
            id="playwright-tool"
            className="w-full rounded-md border bg-background p-2"
            value={name}
            disabled={execution.isPending || agent.isPending}
            onChange={(event) => {
              setName(event.target.value);
              setArgs(
                event.target.value === "browser_navigate" ? '{"url":"https://example.com"}' : "{}",
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
            disabled={execution.isPending || agent.isPending}
            onChange={(event) => setArgs(event.target.value)}
            className="min-h-28 font-mono"
          />
          <Button
            disabled={execution.isPending || agent.isPending || !selected}
            onClick={() => execution.mutate()}
          >
            {execution.isPending ? "Running…" : "Run action"}
          </Button>
          <Button
            className="ml-2"
            variant="outline"
            disabled={execution.isPending || agent.isPending}
            onClick={() => {
              setName("browser_close");
              setArgs("{}");
              execution.reset();
            }}
          >
            Select close browser
          </Button>
        </>
      ) : null}
      {execution.isError ? <p role="alert">{execution.error.message}</p> : null}
      {execution.isSuccess ? (
        <pre
          role="status"
          className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 text-xs"
        >
          {JSON.stringify(execution.data, null, 2)}
        </pre>
      ) : null}
    </section>
  );
}
