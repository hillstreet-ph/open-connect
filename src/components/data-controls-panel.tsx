import { ContextStoragePanel } from "@/components/context-storage-panel";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useRouteContext } from "@tanstack/react-router";
import { ChevronDown, Download, Loader2, Database, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  getDataControls,
  saveDataControls,
  exportDataControls,
  clearDataActivity,
  saveReuseDraft,
  buildReuseDraft,
  saveRepeatedKnowledge,
  type ReuseDraft,
} from "@/lib/data-controls.functions";
import { type DataControls } from "@/lib/data-controls";

export function DataControlsPanel({ studio = false }: { studio?: boolean }) {
  const { user } = useRouteContext({ from: "/_authenticated" });
  return <AccountDataControls key={user.id} studio={studio} userId={user.id} />;
}
function AccountDataControls({ studio, userId }: { studio: boolean; userId: string }) {
  const getControls = useServerFn(getDataControls);
  const saveControls = useServerFn(saveDataControls);
  const exportControls = useServerFn(exportDataControls);
  const clearActivity = useServerFn(clearDataActivity);
  const saveDraftFn = useServerFn(saveReuseDraft);
  const buildDraftFn = useServerFn(buildReuseDraft);
  const saveKnowledgeFn = useServerFn(saveRepeatedKnowledge);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["data-controls", userId],
    queryFn: () => getControls(),
    refetchInterval: 30000,
  });
  const [draft, setDraft] = useState<DataControls | null>(null);
  const [editor, setEditor] = useState<{
    id?: string;
    title: string;
    content: string;
    resource_type: string;
  } | null>(null);
  const settings = draft ?? query.data?.settings;
  const refresh = () => client.invalidateQueries({ queryKey: ["data-controls"] });
  const save = useMutation({
    mutationFn: async () => {
      if (!settings) return;
      await saveControls({ data: settings });
    },
    onSuccess: () => {
      setDraft(null);
      void refresh();
      toast.success("Data Controls saved for your account");
    },
    onError: (e) => toast.error(e.message),
  });
  const download = useMutation({
    mutationFn: async () => {
      const json = await exportControls();
      const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `open-connect-data-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    onSuccess: () => toast.success("Data export downloaded"),
    onError: (e) => toast.error(e.message),
  });
  const clear = useMutation({
    mutationFn: () => clearActivity(),
    onSuccess: () => {
      void refresh();
      toast.success("Saved activity cleared");
    },
    onError: (e) => toast.error(e.message),
  });
  const saveDraft = useMutation({
    mutationFn: async () => {
      if (editor) await saveDraftFn({ data: editor });
    },
    onSuccess: () => {
      setEditor(null);
      void refresh();
      toast.success("Private draft saved");
    },
    onError: (e) => toast.error(e.message),
  });
  const knowledge = useMutation({
    mutationFn: (key: string) => saveKnowledgeFn({ data: { key } }),
    onSuccess: () => {
      void refresh();
      toast.success("Unverified note saved in Knowledge");
    },
    onError: (e) => toast.error(e.message),
  });
  const build = useMutation({
    mutationFn: (id: string) => buildDraftFn({ data: { id } }),
    onSuccess: () => {
      void refresh();
      void client.invalidateQueries({ queryKey: ["resources-review-queue"] });
      toast.success(
        "Private resource created. Review its source, license and content in Studio before publishing.",
      );
    },
    onError: (e) => toast.error(e.message),
  });
  if (query.isPending)
    return (
      <p className="flex gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" />
        Loading Data Controls…
      </p>
    );
  if (query.isError || !settings)
    return (
      <Card>
        <CardContent className="p-5">
          <p role="alert">{query.error?.message ?? "Data Controls unavailable"}</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  const update = (key: keyof DataControls, value: boolean | number) =>
    setDraft({ ...settings, [key]: value });
  const drafts = query.data?.drafts ?? [];
  const totals = new Map<string, number>();
  for (const event of query.data?.activity ?? []) {
    const key = event.source_kind === "capability" ? event.source_key : event.source_kind;
    totals.set(key, (totals.get(key) ?? 0) + 1);
  }
  const edit = (d: ReuseDraft) =>
    setEditor({ id: d.id, title: d.title, content: d.content, resource_type: d.resource_type });
  return (
    <div className="space-y-5" id={studio ? undefined : "data-controls"}>
      {!studio && <ContextStoragePanel />}
      {!studio && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="size-5" />
              Data Controls
            </CardTitle>
            <CardDescription>
              Account-wide settings for Open-Connect. Your Memory, Knowledge and reusable drafts
              stay private until you explicitly publish a reviewed resource.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {(
              [
                [
                  "capture_activity",
                  "Save activity across Open-Connect",
                  "Index Memory, Knowledge, created resources, Toolkits, and verified capability runs. Activity stores record identifiers, not tool payloads.",
                ],
                [
                  "save_helper_memory",
                  "Automatically save Agent-Helper memory",
                  "Save redacted interaction summaries to Memory after replies. Assistant text remains unverified; this does not save every external app conversation.",
                ],
                [
                  "suggest_drafts",
                  "Suggest reusable drafts",
                  "After the same capability succeeds in three verified runs, create one private workflow draft. Source, license and security review are still required.",
                ],
              ] as const
            ).map(([key, title, description]) => (
              <div key={key} className="flex items-start justify-between gap-4">
                <div>
                  <Label htmlFor={`data-${key}`} className="text-sm font-medium">
                    {title}
                  </Label>
                  <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                </div>
                <Switch
                  id={`data-${key}`}
                  checked={settings[key]}
                  onCheckedChange={(v) => update(key, v)}
                />
              </div>
            ))}
            <div className="space-y-2">
              <Label htmlFor="data-retention">Automatic data retention</Label>
              <select
                id="data-retention"
                className="block rounded-md border bg-background p-2 text-sm"
                value={settings.retention_days}
                onChange={(e) => update("retention_days", Number(e.target.value))}
              >
                {[30, 90, 365].map((n) => (
                  <option key={n} value={n}>
                    {n} days
                  </option>
                ))}
              </select>
              <p className="text-sm text-muted-foreground">
                Applies to the activity index and automatically saved memories and knowledge.
                Manually saved Memory, Knowledge and Studio drafts are kept until you delete them.
              </p>
            </div>
            <Button disabled={save.isPending || !draft} onClick={() => save.mutate()}>
              Save controls
            </Button>
            <div className="border-t pt-5">
              <h3 className="font-medium">Export your data</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Download Memory, Knowledge, activity, drafts, owned resource metadata and Toolkit
                metadata as JSON. Credentials and binary attachments are excluded; common secrets in
                text are redacted.
              </p>
              <Button
                className="mt-3"
                variant="outline"
                disabled={download.isPending}
                onClick={() => download.mutate()}
              >
                <Download className="size-4" />
                {download.isPending ? "Preparing export…" : "Export data"}
              </Button>
            </div>
            <div className="border-t pt-5">
              <h3 className="font-medium">Clear saved activity</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Removes your activity index. Existing Memory, Knowledge and drafts remain. Turn off
                activity capture to stop new records.
              </p>
              <Button
                className="mt-3"
                variant="outline"
                disabled={clear.isPending}
                onClick={() => {
                  if (window.confirm("Clear your saved activity index? This cannot be undone."))
                    clear.mutate();
                }}
              >
                Clear activity
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
      {!studio && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Repeated prompts and responses</CardTitle>
            <CardDescription>
              Exact matches after case and whitespace normalization, across the latest 200
              automatically saved helper or explicitly shared host exchanges within retention. New
              captures only; not semantic detection or access to external chat history.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="rounded-lg border px-3 py-2">
                Memory capture: {settings.save_helper_memory ? "On" : "Off"}
              </span>
              <span className="rounded-lg border px-3 py-2">
                Draft suggestions: {settings.suggest_drafts ? "On" : "Off"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Three distinct saved exchanges with the same prompt can create one private prompt
              draft when both controls are on. Repeated responses stay unverified. Review source
              excerpts and remove private details before building a resource.
            </p>
            {(query.data?.repeated ?? []).map((group) => (
              <div key={group.key} className="space-y-3 rounded-lg border p-4">
                <p className="text-sm font-medium">
                  Repeated {group.kind} · {group.count} distinct saved exchanges
                </p>
                <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                  {group.summary}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={knowledge.isPending}
                    onClick={() => knowledge.mutate(group.key)}
                  >
                    Save unverified Knowledge note
                  </Button>
                  {group.kind === "prompt" && group.count >= 3 && (
                    <Button size="sm" variant="outline" asChild>
                      <a href="#reuse-drafts">Review suggestions below</a>
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {!query.data?.repeated?.length && (
              <p className="text-sm text-muted-foreground">
                No repeated patterns detected in this sample. Enable automatic helper memory above
                to capture future sent prompts and received replies.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Identical exchanges are deduplicated. Drafts can recommend tools, skills, apps and
              toolkits, but do not install or execute them. Knowledge notes saved here are manual
              records, kept until you delete them.
            </p>
          </CardContent>
        </Card>
      )}
      {!studio && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent saved activity</CardTitle>
            <CardDescription>
              Counts from the latest 200 indexed records within your retention period. Capability
              counts represent distinct verified runs.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {[...totals]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 12)
                .map(([name, count]) => (
                  <span
                    key={name}
                    className="max-w-full break-words rounded-lg border px-3 py-2 text-sm"
                  >
                    {name} · {count}
                  </span>
                ))}
              {!totals.size && (
                <p className="text-sm text-muted-foreground">
                  No saved activity yet. Enable capture to record future activity.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
      <Card id="reuse-drafts">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4" />
            Reusable Studio drafts
          </CardTitle>
          <CardDescription>
            Create prompts, skills, guides or Toolkit blueprints from your own workflow. Automatic
            suggestions use verified capability activity and contain no private run payloads.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            variant="outline"
            onClick={() => setEditor({ title: "", content: "", resource_type: "prompt" })}
          >
            Create draft
          </Button>
          {editor && (
            <div className="space-y-3 rounded-lg border p-4">
              <Label htmlFor="reuse-title">Title</Label>
              <Input
                id="reuse-title"
                value={editor.title}
                maxLength={200}
                onChange={(e) => setEditor({ ...editor, title: e.target.value })}
              />
              <Label htmlFor="reuse-type">Type</Label>
              <select
                id="reuse-type"
                className="block rounded-md border bg-background p-2"
                value={editor.resource_type}
                onChange={(e) => setEditor({ ...editor, resource_type: e.target.value })}
              >
                {["prompt", "skill", "guide", "toolkit"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <Label htmlFor="reuse-content">Content / workflow blueprint</Label>
              <Textarea
                id="reuse-content"
                rows={9}
                value={editor.content}
                maxLength={50000}
                onChange={(e) => setEditor({ ...editor, content: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Use placeholders and secure credential references. Remove personal information
                before sharing.
              </p>
              <div className="flex gap-2">
                <Button disabled={saveDraft.isPending} onClick={() => saveDraft.mutate()}>
                  Save private draft
                </Button>
                <Button variant="ghost" onClick={() => setEditor(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
          <Collapsible defaultOpen={false} className="space-y-2">
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm font-medium hover:bg-muted/50">
              <span>Your drafts</span>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                {drafts.length} item(s)
                <ChevronDown className="size-4" />
              </span>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3">
              {drafts.map((d) => (
                <div
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
                >
                  <div className="min-w-0">
                    <p className="break-words font-medium">{d.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.resource_type} ·{" "}
                      {d.resource_id ? "Built for resource review" : "Private draft"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {!d.resource_id ? (
                      <>
                        <Button size="sm" variant="outline" onClick={() => edit(d)}>
                          Edit
                        </Button>
                        <Button size="sm" disabled={build.isPending} onClick={() => build.mutate(d.id)}>
                          Build for review
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="outline" asChild>
                        <Link to="/studio" hash="review">
                          Review & publish
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {!drafts.length && (
                <p className="text-sm text-muted-foreground">
                  No drafts yet. Start one here, or enable usage-based suggestions in Data Controls.
                </p>
              )}
            </CollapsibleContent>
          </Collapsible>
          {studio && (
            <Button variant="link" asChild>
              <Link to="/settings" hash="data">
                Open Data Controls
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
