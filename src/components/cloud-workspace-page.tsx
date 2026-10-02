import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRoles } from "@/hooks/use-roles";
import { listAppConnections } from "@/lib/connections.functions";
import { discoverCloudTools, runCloudTool } from "@/lib/cloud-workspace.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const descriptions = {
  computer: "Run desktop automation through your connected cloud computer provider.",
  browser:
    "Discover and run browser sessions, navigation, and extraction tools from your provider.",
  terminal: "Run commands and manage sandbox sessions through your connected terminal provider.",
  phone: "Control a cloud Android device through your connected phone provider.",
};

export function CloudWorkspacePage({ kind }: { kind: keyof typeof descriptions }) {
  const title = `Cloud ${kind.charAt(0).toUpperCase()}${kind.slice(1)}`;
  const { isAdmin } = useRoles();
  const [connectionId, setConnectionId] = useState("");
  const [toolName, setToolName] = useState("");
  const [argumentsText, setArgumentsText] = useState("{}");
  const [confirm, setConfirm] = useState(false);
  const list = useServerFn(listAppConnections);
  const discover = useServerFn(discoverCloudTools);
  const run = useServerFn(runCloudTool);
  const connections = useQuery({ queryKey: ["app-connections"], queryFn: () => list({}) });
  const candidates = (connections.data ?? []).filter((item) => item.provider === "custom_mcp");
  const catalog = useQuery({
    queryKey: ["cloud-tools", connectionId],
    queryFn: () => discover({ data: { connectionId } }),
    enabled: Boolean(connectionId),
    retry: false,
  });
  const selectedTool = catalog.data?.tools.find((tool) => tool["name"] === toolName);
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
        data: { connectionId, toolName, arguments: args as Record<string, unknown>, confirm },
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
          <CardTitle className="text-base">Provider connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Choose the verified Custom MCP connection for this device. Available controls come from
            the provider's live tool catalog.
          </p>
          {connections.isLoading ? <p role="status">Loading connections…</p> : null}
          {connections.isError ? (
            <p role="alert">
              Could not load connections.{" "}
              <Button variant="link" onClick={() => void connections.refetch()}>
                Retry
              </Button>
            </p>
          ) : null}
          {!connections.isLoading && !connections.isError && candidates.length === 0 ? (
            <p>
              No cloud provider is connected yet. Add its MCP endpoint and credentials in
              Connectors, then return here.
            </p>
          ) : null}
          <Label htmlFor={`provider-${kind}`}>Connection</Label>
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
            <option value="">Select a provider</option>
            {candidates.map((item) => (
              <option key={item.id} value={item.id} disabled={item.status !== "connected"}>
                {item.display_name} — {item.status.replaceAll("_", " ")}
              </option>
            ))}
          </select>
          <Button asChild variant="outline">
            <Link to="/connections">Manage connections</Link>
          </Button>
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
            A connection does not provision a device. Provider subscriptions, device availability,
            and sign-in requirements apply.
          </p>
        </CardContent>
      </Card>
      {catalog.isFetching ? <p role="status">Discovering provider tools…</p> : null}
      {catalog.isError ? <p role="alert">{catalog.error.message}</p> : null}
      {catalog.data && !catalog.isError ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Provider controls</CardTitle>
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
                <option key={String(tool["name"])} value={String(tool["name"])}>
                  {String(tool["name"])}
                </option>
              ))}
            </select>
            {selectedTool ? (
              <>
                <p className="text-sm">{String(selectedTool["description"] ?? "")}</p>
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
                  disabled={!isAdmin || execution.isPending || (destructive && !confirm)}
                  onClick={() => execution.mutate()}
                >
                  {execution.isPending ? "Running…" : "Run tool"}
                </Button>
                {!isAdmin ? (
                  <p className="text-sm">An owner or administrator can run cloud controls.</p>
                ) : null}
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
