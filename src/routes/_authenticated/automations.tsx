import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Play, Plus, Workflow, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  createAutomation,
  listAutomations,
  runAutomation,
  toggleAutomation,
  type ActionType,
  type TriggerType,
} from "@/lib/ops.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/automations")({
  head: () => ({
    meta: [
      { title: "Automations — Open-Connect" },
      {
        name: "description",
        content: "Trigger → action pipelines for agents, webhooks, MCP, and notifications.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AutomationsPage,
});

function AutomationsPage() {
  const qc = useQueryClient();
  const list = useServerFn(listAutomations);
  const create = useServerFn(createAutomation);
  const toggle = useServerFn(toggleAutomation);
  const run = useServerFn(runAutomation);

  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState<TriggerType>("manual");
  const [actionType, setActionType] = useState<ActionType>("agent");

  const rows = useQuery({ queryKey: ["automations"], queryFn: () => list({}) });

  const createMutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          name,
          triggerType,
          actionType,
          config: { source: "open-connect", plane: "operations" },
        },
      }),
    onSuccess: () => {
      toast.success("Automation created");
      setName("");
      void qc.invalidateQueries({ queryKey: ["automations"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const toggleMutation = useMutation({
    mutationFn: (input: { id: string; enabled: boolean }) => toggle({ data: input }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["automations"] }),
  });

  const runMutation = useMutation({
    mutationFn: (id: string) => run({ data: { id } }),
    onSuccess: () => {
      toast.success("Run recorded");
      void qc.invalidateQueries({ queryKey: ["automations"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Run failed"),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <div>
        <Badge variant="outline" className="mb-2 border-primary/40 text-primary">
          <Workflow className="mr-1 size-3" /> Operations · Automations
        </Badge>
        <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">Automations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Trigger → action rules for agents, webhooks, MCP tools, and pipelines.
        </p>
      </div>

      <Card className="shadow-panel">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">New automation</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-2 sm:col-span-3">
            <Label htmlFor="auto-name">Name</Label>
            <Input
              id="auto-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="On schedule → run agent health check"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="auto-trigger">Trigger</Label>
            <select
              id="auto-trigger"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value as TriggerType)}
            >
              <option value="manual">Manual</option>
              <option value="schedule">Schedule</option>
              <option value="webhook">Webhook</option>
              <option value="event">Event</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="auto-action">Action</Label>
            <select
              id="auto-action"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={actionType}
              onChange={(e) => setActionType(e.target.value as ActionType)}
            >
              <option value="agent">Agent</option>
              <option value="mcp">MCP</option>
              <option value="webhook">Webhook</option>
              <option value="pipeline">Pipeline</option>
              <option value="notify">Notify</option>
            </select>
          </div>
          <div className="flex items-end">
            <Button
              className="w-full"
              disabled={!name.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Create
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {(rows.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No automations yet.</p>
        ) : (
          rows.data?.map((a) => (
            <Card key={a.id} className="p-4 shadow-panel">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Zap className="size-4 text-primary" />
                    <p className="font-medium">{a.name}</p>
                    <Badge variant={a.enabled ? "secondary" : "outline"} className="text-[10px]">
                      {a.enabled ? "enabled" : "disabled"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {a.trigger_type} → {a.action_type}
                    {a.last_run_at ? ` · last ${new Date(a.last_run_at).toLocaleString()}` : ""}
                    {a.last_status ? ` · ${a.last_status}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleMutation.mutate({ id: a.id, enabled: !a.enabled })}
                  >
                    {a.enabled ? "Disable" : "Enable"}
                  </Button>
                  <Button
                    size="sm"
                    disabled={runMutation.isPending}
                    onClick={() => runMutation.mutate(a.id)}
                  >
                    <Play className="size-3.5" /> Run
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
