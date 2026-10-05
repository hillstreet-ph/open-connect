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

const descriptions = {
  computer: "Run desktop automation through a personal or project-shared provider connection.",
  browser: "Discover and run browser tools through a connection available to this project.",
  terminal: "Run terminal tools through a connection available to this project.",
  phone: "Use cloud phone tools through a connection available to this project.",
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
    enabled: Boolean(projectId),
    retry: false,
  });
  const candidates = connections.data ?? [];
  const catalog = useQuery({
    queryKey: ["cloud-tools", projectId, connectionId],
    queryFn: () => discover({ data: { projectId, connectionId } }),
    enabled: Boolean(projectId && connectionId),
    retry: false,
  });
  const selectedTool = catalog.data?.tools.find((tool) => tool.name === toolName);
  const destructive = selectedTool?.destructive === true;
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
          projectId,
          connectionId,
          toolName,
          arguments: args as Record<string, unknown>,
          confirm,
        },
      });
    },
  });
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
          <CardTitle className="text-base">Project and connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Choose a project, then select one of your own connections or a connector explicitly
            shared with that project. Shared access never reveals the account secret.
          </p>
          {projects.isLoading ? <p role="status">Loading projects…</p> : null}
          {projects.isError ? <p role="alert">Could not load projects.</p> : null}
          {!projects.isLoading && !projects.isError && projects.data?.length === 0 ? (
            <p>No projects are assigned to your account yet. Ask an Admin to share a project.</p>
          ) : null}
          <Label htmlFor={`project-${kind}`}>Project</Label>
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
            <option value="">Select a project</option>
            {(projects.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>

          {projectId ? (
            <>
              {connections.isLoading ? <p role="status">Loading project connections…</p> : null}
              {connections.isError ? (
                <p role="alert">
                  Could not load connections for this project. Check project membership and retry.
                </p>
              ) : null}
              {!connections.isLoading && !connections.isError && candidates.length === 0 ? (
                <p>
                  No available cloud connection. Connect your own provider or ask an Admin to share
                  a project connection in the project settings.
                </p>
              ) : null}
              <Label htmlFor={`provider-${kind}`}>Available connection</Label>
              <select
                id={`provider-${kind}`}
                className="w-full rounded-md border bg-background p-2"
                value={connectionId}
                disabled={execution.isPending || !project}
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
          ) : null}
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
                setToolName(event.target.value);
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
