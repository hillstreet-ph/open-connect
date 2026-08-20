import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { connectAgent, disconnectAgent, listAgentConnections } from "@/lib/agents.functions";
import { listToolkits } from "@/lib/toolkits.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/agents")({
  head: () => ({
    meta: [
      { title: "Connect an Agent — Open-Connect" },
      { name: "description", content: "Register an MCP server URL and mint a scoped Open-Connect key for your agent." },
      { property: "og:title", content: "Connect an Agent — Open-Connect" },
      { property: "og:description", content: "Point an agent at an MCP URL and get one scoped key." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AgentsPage,
});

function AgentsPage() {
  const queryClient = useQueryClient();
  const list = useServerFn(listAgentConnections);
  const connect = useServerFn(connectAgent);
  const disconnect = useServerFn(disconnectAgent);
  const toolkitsFn = useServerFn(listToolkits);

  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [mcpUrl, setMcpUrl] = useState("");
  const [toolkitId, setToolkitId] = useState<string>("");
  const [issuedKey, setIssuedKey] = useState<string | null>(null);

  const connections = useQuery({ queryKey: ["agent-connections"], queryFn: () => list({}) });
  const toolkits = useQuery({ queryKey: ["toolkits"], queryFn: () => toolkitsFn({}) });

  const connectMutation = useMutation({
    mutationFn: () => connect({ data: { name, mcpUrl, toolkitId: toolkitId || null } }),
    onSuccess: (result) => {
      setIssuedKey(result.key);
      setStep(3);
      void queryClient.invalidateQueries({ queryKey: ["agent-connections"] });
      void queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      toast.success(
        result.connection.state === "ready"
          ? "Agent connected"
          : `Key issued — MCP server reported: ${result.connection.state}`,
      );
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not connect the agent"),
  });

  const disconnectMutation = useMutation({
    mutationFn: (id: string) => disconnect({ data: { id } }),
    onSuccess: () => {
      toast.success("Agent disconnected");
      void queryClient.invalidateQueries({ queryKey: ["agent-connections"] });
    },
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <h1 className="text-3xl font-semibold">Connect an Agent</h1>
      <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
        Point Open-Connect at your agent's MCP endpoint. We mint one scoped key that also unlocks{" "}
        <code className="font-mono">/v1</code> models and any Toolkit you attach.
      </p>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card className="shadow-panel">
          <CardHeader>
            <CardDescription>Step {Math.min(step, 3)} of 3</CardDescription>
            <CardTitle className="text-base">
              {step === 1 ? "MCP endpoint" : step === 2 ? "Attach a Toolkit" : "Your agent key"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {step === 1 ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="agent-name">Agent name</Label>
                  <Input
                    id="agent-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Claude desktop"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="agent-mcp">MCP server URL</Label>
                  <Input
                    id="agent-mcp"
                    value={mcpUrl}
                    onChange={(event) => setMcpUrl(event.target.value)}
                    placeholder="https://your-server.example.com/mcp"
                  />
                </div>
                <Button disabled={!name.trim() || !mcpUrl.trim()} onClick={() => setStep(2)}>
                  Continue
                </Button>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Optional: scope this agent to one Toolkit.
                </p>
                <div className="space-y-2">
                  {(toolkits.data ?? []).map((toolkit) => (
                    <button
                      key={toolkit.id}
                      onClick={() => setToolkitId(toolkitId === toolkit.id ? "" : toolkit.id)}
                      className={cn(
                        "w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                        toolkitId === toolkit.id
                          ? "border-primary/60 bg-primary/10"
                          : "border-border hover:border-primary/40",
                      )}
                    >
                      {toolkit.name}
                    </button>
                  ))}
                  {!toolkits.data?.length ? (
                    <p className="text-sm text-muted-foreground">No toolkits yet — you can skip this.</p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(1)}>
                    Back
                  </Button>
                  <Button disabled={connectMutation.isPending} onClick={() => connectMutation.mutate()}>
                    {connectMutation.isPending ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
                    Connect and generate key
                  </Button>
                </div>
              </div>
            ) : null}

            {step === 3 && issuedKey ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
                  <p className="text-xs text-muted-foreground">Copy this key now — it is only shown once.</p>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="flex-1 break-all font-mono text-xs text-primary">{issuedKey}</code>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        void navigator.clipboard.writeText(issuedKey);
                        toast.success("Copied");
                      }}
                    >
                      <Copy className="size-3.5" />
                    </Button>
                  </div>
                </div>
                <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 text-xs">
{`curl https://open-connect.site/v1/chat/completions \\
  -H "Authorization: Bearer ${issuedKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"google/gemini-3.7-flash","messages":[{"role":"user","content":"ping"}]}'`}
                </pre>
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep(1);
                    setName("");
                    setMcpUrl("");
                    setToolkitId("");
                    setIssuedKey(null);
                  }}
                >
                  Connect another agent
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="shadow-panel">
          <CardHeader>
            <CardTitle className="text-base">Connected agents</CardTitle>
            <CardDescription>Each agent has its own revocable key.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {connections.data?.length ? (
              connections.data.map((connection) => (
                <div key={connection.id} className="rounded-lg border border-border p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{connection.name}</p>
                      <p className="truncate font-mono text-xs text-muted-foreground">{connection.mcp_url}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => disconnectMutation.mutate(connection.id)}
                      aria-label={`Disconnect ${connection.name}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        connection.state === "ready" && "border-accent/50 text-accent",
                        connection.state === "failed" && "border-destructive/50 text-destructive",
                      )}
                    >
                      {connection.state}
                    </Badge>
                    {connection.api_keys ? (
                      <span className="font-mono text-xs text-muted-foreground">
                        {connection.api_keys.key_prefix}…
                      </span>
                    ) : null}
                    {connection.toolkits ? (
                      <Badge variant="secondary" className="text-xs">
                        {connection.toolkits.name}
                      </Badge>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No agents connected yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
