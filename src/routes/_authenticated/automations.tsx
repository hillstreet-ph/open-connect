import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Play, Plus, Workflow, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  createAutomation,
  listAutomations,
  listAutomationRuns,
  runAutomation,
  toggleAutomation,
  type ActionType,
  type TriggerType,
} from "@/lib/ops.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  const listRuns = useServerFn(listAutomationRuns);
  const create = useServerFn(createAutomation);
  const toggle = useServerFn(toggleAutomation);
  const run = useServerFn(runAutomation);

  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState<TriggerType>("manual");
  const [actionType, setActionType] = useState<ActionType>("model");
  const [prompt, setPrompt] = useState("");

  const rows = useQuery({ queryKey: ["automations"], queryFn: () => list({}) });

  const runs = useQuery({ queryKey: ["automation-runs"], queryFn: () => listRuns({}) });

  const createMutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          name,
          triggerType,
          actionType,
          config: {
            source: "open-connect",
            plane: "operations",
            prompt,
            ...(prompt.trim() ? { goal: prompt.trim() } : {}),
          },
        },
      }),
    onSuccess: () => {
      toast.success("Automation created");
      setName("");
      setPrompt("");
      void qc.invalidateQueries({ queryKey: ["automations"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const toggleMutation = useMutation({
    mutationFn: (input: { id: string; enabled: boolean }) => toggle({ data: input }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["automations"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  const runMutation = useMutation({
    mutationFn: (id: string) => run({ data: { id } }),
    onSuccess: (result) => {
      toast.success(
        result.last_status === "succeeded"
          ? "AI response saved"
          : result.last_status === "approval_required"
            ? "Plan saved — approval required"
            : "Plan saved — execution pending",
      );
      void qc.invalidateQueries({ queryKey: ["automations"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Run failed"),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["automation-runs"] });
      void qc.invalidateQueries({ queryKey: ["automations"] });
    },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <div>
        <Badge variant="outline" className="mb-2 border-primary/40 text-primary">
          <Workflow className="mr-1 size-3" /> Operations · Automations
        </Badge>
        <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
          Automations
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Run AI prompts with your OpenRouter connection and review saved responses. Agent and
          pipeline actions create plans; scheduled, webhook, and event execution is not connected
          yet.
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
              placeholder="Summarize a project brief"
            />
          </div>
          <div className="space-y-2">
            {runs.isError ? (
              <p role="alert">
                Could not load run history.{" "}
                <Button variant="link" onClick={() => void runs.refetch()}>
                  Retry
                </Button>
              </p>
            ) : null}
            <Label htmlFor="auto-trigger">Trigger</Label>
            <select
              id="auto-trigger"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value as TriggerType)}
            >
              <option value="manual">Manual</option>
              <option value="schedule" disabled={actionType === "model"}>
                Schedule (not connected)
              </option>
              <option value="webhook" disabled>
                Webhook (not connected)
              </option>
              <option value="event" disabled>
                Event (not connected)
              </option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="auto-action">Action</Label>
            <select
              id="auto-action"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={actionType}
              onChange={(e) => {
                setActionType(e.target.value as ActionType);
                if (e.target.value === "model") setTriggerType("manual");
              }}
            >
              <option value="model">AI response (free model)</option>
              <option value="agent">Agent plan</option>
              <option value="mcp" disabled>
                MCP (not connected)
              </option>
              <option value="webhook" disabled>
                Webhook (not connected)
              </option>
              <option value="pipeline">Pipeline plan</option>
              <option value="notify" disabled>
                Notify (not connected)
              </option>
            </select>
          </div>
          <div className="flex items-end">
            <Button
              className="w-full"
              disabled={
                !name.trim() ||
                (actionType === "model" && !prompt.trim()) ||
                createMutation.isPending
              }
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
          <div className="space-y-2 sm:col-span-3">
            <Label htmlFor="auto-prompt">{actionType === "model" ? "AI prompt" : "Goal"}</Label>
            <Textarea
              id="auto-prompt"
              value={prompt}
              maxLength={8000}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the response you need…"
            />
            {actionType === "model" ? (
              <p className="text-xs text-muted-foreground">
                Sends this prompt to a free OpenRouter model when you click Run. Responses are saved
                in your private run history. Provider availability and rate limits apply.
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {rows.isLoading ? <p role="status">Loading automations…</p> : null}
        {rows.isError ? (
          <p role="alert">
            Could not load automations.{" "}
            <Button variant="link" onClick={() => void rows.refetch()}>
              Retry
            </Button>
          </p>
        ) : null}
        {!rows.isLoading && !rows.isError && (rows.data ?? []).length === 0 ? (
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
                    disabled={toggleMutation.isPending}
                    size="sm"
                    variant="outline"
                    onClick={() => toggleMutation.mutate({ id: a.id, enabled: !a.enabled })}
                  >
                    {a.enabled ? "Disable" : "Enable"}
                  </Button>
                  <Button
                    size="sm"
                    disabled={runMutation.isPending || !a.enabled}
                    onClick={() => runMutation.mutate(a.id)}
                  >
                    <Play className="size-3.5" /> Run
                  </Button>
                </div>
              </div>
              {a.action_type === "model" ? (
                <div className="mt-3 space-y-2">
                  {(runs.data ?? [])
                    .filter((r) => r.evidence.automation_id === a.id)
                    .slice(0, 5)
                    .map((r) => (
                      <details
                        key={r.id}
                        className="rounded border p-3 text-sm"
                        open={r.id === runMutation.data?.correlation_id}
                      >
                        <summary className="cursor-pointer">
                          {r.state} · {new Date(r.created_at).toLocaleString()}
                          {r.evidence.model ? ` · ${r.evidence.model}` : ""}
                        </summary>
                        {r.evidence.output ? (
                          <p className="mt-2 whitespace-pre-wrap break-words">
                            {r.evidence.output}
                          </p>
                        ) : null}
                        {r.evidence.error ? (
                          <p role="alert" className="mt-2 text-destructive">
                            {r.evidence.error}
                          </p>
                        ) : null}
                        {r.state === "running" ? (
                          <p className="mt-2">
                            Run started. If this persists after refreshing, the request may have
                            been interrupted; completion has not been verified.
                          </p>
                        ) : null}
                      </details>
                    ))}
                </div>
              ) : null}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
