import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listProjectCloudConnections } from "@/lib/workspace.functions";
import { listProjects } from "@/lib/orgs.functions";
import { discoverCloudTools, runCloudTool } from "@/lib/cloud-workspace.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { extractLiveViewUrls } from "@/lib/cloud-live-view";

/** Common provider tools surfaced as one-tap starting points (TinyFish names first). */
const QUICK_START_TOOLS: Record<keyof typeof descriptions, string[]> = {
  browser: [
    "run_web_automation",
    "create_browser_session",
    "list_browser_sessions",
    "close_browser_session",
    "start_profile_setup_session",
    "save_profile_setup_session",
    "fetch",
    "search",
  ],
  computer: ["create_sandbox", "computer_use", "screenshot"],
  terminal: ["run_command", "execute_command", "create_sandbox"],
  phone: ["create_device", "list_devices"],
};

const ARGUMENT_TEMPLATES: Record<string, Record<string, unknown>> = {
  run_web_automation: {
    url: "https://example.com",
    goal: "Describe the task in plain language",
    browser_profile: "lite",
  },
  create_browser_session: { url: "https://example.com", timeout_seconds: 600 },
  start_profile_setup_session: { profile_id: "default", url: "https://example.com/login" },
};

const descriptions = {
  computer: "Run desktop automation through a personal or project-shared provider connection.",
  browser:
    "Drive a real cloud browser — natural-language tasks, saved sign-in profiles, live view and raw CDP sessions — through a personal or project-shared connection.",
  terminal: "Run terminal tools through a personal or project-shared connection.",
  phone: "Use cloud phone tools through a personal or project-shared connection.",
};

export function CloudWorkspacePage({ kind }: { kind: keyof typeof descriptions }) {
  const title = `Cloud ${kind.charAt(0).toUpperCase()}${kind.slice(1)}`;
  const [projectId, setProjectId] = useState("");
  const [connectionId, setConnectionId] = useState("");
  const [toolName, setToolName] = useState("");
  const [argumentsText, setArgumentsText] = useState("{}");
  const [confirm, setConfirm] = useState(false);
  const getProjects = useServerFn(listProjects);
  const getConnections = useServerFn(listProjectCloudConnections);
  const discover = useServerFn(discoverCloudTools);
  const run = useServerFn(runCloudTool);
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => getProjects({}) });
  const project = (projects.data ?? []).find((item) => item.id === projectId);
  const connections = useQuery({
    queryKey: ["project-cloud-connections", projectId],
    queryFn: () => getConnections({ data: { projectId } }),
    retry: false,
  });
  const candidates = (connections.data ?? []).filter(
    (item) => !item.kinds || item.kinds.includes(kind),
  );
  const catalog = useQuery({
    queryKey: ["cloud-tools", projectId, connectionId],
    queryFn: () => discover({ data: { projectId: projectId || undefined, connectionId } }),
    enabled: Boolean(connectionId),
    retry: false,
  });
  const selectedTool = catalog.data?.tools.find((tool) => tool.name === toolName);
  const sessionTools = (catalog.data?.tools ?? []).filter((tool) =>
    /session|profile|browser.context|cookie/i.test(`${tool.name} ${tool.description}`),
  );
  const destructive = selectedTool?.destructive === true;
  const quickStart = (catalog.data?.tools ?? []).filter((tool) =>
    QUICK_START_TOOLS[kind].includes(tool.name),
  );
  const execution = useMutation({
    mutationFn: async () => {
      let args: unknown;
      try {
        args = JSON.parse(argumentsText);
      } catch {
        throw new Error("Arguments must be valid JSON.");
      }
      if (!args || typeof args !== "object" || Array.isArray(args))
        throw new Error("Arguments must be a JSON object.");
      return run({
        data: {
          projectId: projectId || undefined,
          connectionId,
          toolName,
          arguments: args as Record<string, unknown>,
          confirm,
        },
      });
    },
  });
  const selectTool = (name: string) => {
    setToolName(name);
    const template = ARGUMENT_TEMPLATES[name];
    if (template) {
      const args = { ...template };
      // TinyFish requires a fresh session id for every automation run.
      if (name === "run_web_automation") args["session_id"] = crypto.randomUUID();
      setArgumentsText(JSON.stringify(args, null, 2));
    }
  };
  const liveViews = execution.isSuccess ? extractLiveViewUrls(execution.data.result) : [];
  const resetTool = () => {
    setToolName("");
    setArgumentsText("{}");
    setConfirm(false);
    execution.reset();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8 sm:px-6">
      <header>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{descriptions[kind]}</p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workspace and connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Use a personal connection, or choose a project to include its shared connections.
            Provider credentials stay private.
          </p>
          {projects.isLoading ? <p role="status">Loading projects…</p> : null}
          {projects.isError ? <p role="alert">Could not load projects.</p> : null}
          {!projects.isLoading && !projects.isError && projects.data?.length === 0 ? (
            <p>
              You can use personal connections now. Shared connections appear when a project is
              assigned.
            </p>
          ) : null}
          <Label htmlFor={`project-${kind}`}>Workspace</Label>
          <select
            id={`project-${kind}`}
            className="w-full rounded-md border bg-background p-2"
            value={projectId}
            disabled={execution.isPending}
            onChange={(event) => {
              setProjectId(event.target.value);
              setConnectionId("");
              resetTool();
            }}
          >
            <option value="">Personal — your own connections</option>
            {(projects.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>

          {
            <>
              {connections.isLoading ? <p role="status">Loading connections…</p> : null}
              {connections.isError ? (
                <p role="alert">Could not load connections. Check your access and retry.</p>
              ) : null}
              {!connections.isLoading && !connections.isError && candidates.length === 0 ? (
                <p>
                  {kind === "browser"
                    ? "No cloud browser connected. Add a TinyFish API key (agent.tinyfish.ai/api-keys) in Connections, or connect any browser MCP server."
                    : "No available cloud connection. Connect your provider or ask an Admin to share a project connection in the project settings."}
                </p>
              ) : null}
              <Label htmlFor={`provider-${kind}`}>Available connection</Label>
              <select
                id={`provider-${kind}`}
                className="w-full rounded-md border bg-background p-2"
                value={connectionId}
                disabled={execution.isPending}
                onChange={(event) => {
                  setConnectionId(event.target.value);
                  resetTool();
                }}
              >
                <option value="">Select a connection</option>
                {candidates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.display_name} · {item.access}
                  </option>
                ))}
              </select>
              <Button asChild variant="outline">
                <Link to="/connections">Manage your connections</Link>
              </Button>
              {project ? (
                <Button asChild variant="outline">
                  <Link to="/projects/$projectId" params={{ projectId }} hash="project-connections">
                    Open project settings
                  </Link>
                </Button>
              ) : null}
            </>
          }
          {connectionId ? (
            <Button
              variant="ghost"
              disabled={catalog.isFetching || execution.isPending}
              onClick={() => {
                resetTool();
                void catalog.refetch();
              }}
            >
              Refresh tools
            </Button>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Provider authorization still limits what each tool can do. Destructive tools require
            confirmation.
          </p>
        </CardContent>
      </Card>

      {catalog.isFetching ? <p role="status">Discovering provider tools…</p> : null}
      {catalog.isError ? <p role="alert">{catalog.error.message}</p> : null}
      {kind === "browser" && catalog.data && !catalog.isError ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Browser sessions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Saved sign-ins and session lifetime are managed by your browser provider. Use the same
              provider session or profile across tasks to resume it.
            </p>
            {sessionTools.length ? (
              <div className="flex flex-wrap gap-2">
                {sessionTools.map((tool) => (
                  <Button
                    key={tool.name}
                    variant="outline"
                    disabled={execution.isPending}
                    onClick={() => {
                      resetTool();
                      selectTool(tool.name);
                    }}
                  >
                    {tool.name}
                  </Button>
                ))}
              </div>
            ) : (
              <p className="text-sm">
                This connection does not advertise session controls. Connect a browser provider with
                session or profile tools to manage saved sign-ins.
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}
      {quickStart.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick start</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {quickStart.map((tool) => (
              <Button
                key={tool.name}
                variant={toolName === tool.name ? "default" : "outline"}
                size="sm"
                disabled={execution.isPending}
                onClick={() => {
                  resetTool();
                  selectTool(tool.name);
                }}
              >
                {tool.name.replace(/_/g, " ")}
              </Button>
            ))}
          </CardContent>
        </Card>
      ) : null}
      {catalog.data && !catalog.isError ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Provider tools</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Label htmlFor={`tool-${kind}`}>Tool</Label>
            <select
              id={`tool-${kind}`}
              className="w-full rounded-md border bg-background p-2"
              value={toolName}
              disabled={execution.isPending}
              onChange={(event) => {
                resetTool();
                selectTool(event.target.value);
              }}
            >
              <option value="">Select a tool ({catalog.data.tools.length} available)</option>
              {catalog.data.tools.map((tool) => (
                <option key={tool.name} value={tool.name}>
                  {tool.name}
                </option>
              ))}
            </select>
            {selectedTool ? (
              <>
                <p className="text-sm">{selectedTool.description}</p>
                <details>
                  <summary className="cursor-pointer text-sm">Required arguments</summary>
                  <pre className="mt-2 max-h-72 overflow-auto rounded-md bg-muted p-3 text-xs">
                    {selectedTool.inputSchema}
                  </pre>
                </details>
                <Label htmlFor={`arguments-${kind}`}>Arguments (JSON)</Label>
                <Textarea
                  id={`arguments-${kind}`}
                  className="min-h-36 font-mono"
                  value={argumentsText}
                  disabled={execution.isPending}
                  onChange={(event) => setArgumentsText(event.target.value)}
                />
                {destructive ? (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={confirm}
                      disabled={execution.isPending}
                      onChange={(event) => setConfirm(event.target.checked)}
                    />
                    Confirm this destructive operation
                  </label>
                ) : null}
                <Button
                  disabled={execution.isPending || (destructive && !confirm)}
                  onClick={() => execution.mutate()}
                >
                  {execution.isPending ? "Running…" : "Run tool"}
                </Button>
              </>
            ) : null}
            {execution.isError ? <p role="alert">{execution.error.message}</p> : null}
            {liveViews.length ? (
              <div className="space-y-3 rounded-md border p-3">
                <p className="text-sm font-medium">Live session</p>
                <p className="text-xs text-muted-foreground">
                  Watch or take over the cloud session. Sign in by hand here — never paste passwords
                  into task goals.
                </p>
                <div className="flex flex-wrap gap-2">
                  {liveViews.map((url, index) => (
                    <Button key={url} asChild size="sm">
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        Open live view{liveViews.length > 1 ? ` ${index + 1}` : ""}
                      </a>
                    </Button>
                  ))}
                </div>
                <iframe
                  title="Live cloud session"
                  src={liveViews[0]}
                  className="h-[28rem] w-full rounded-md border bg-muted"
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                  allow="clipboard-read; clipboard-write"
                  referrerPolicy="no-referrer"
                />
              </div>
            ) : null}
            {execution.isSuccess ? (
              <pre role="status" className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">
                {execution.data.result}
              </pre>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
