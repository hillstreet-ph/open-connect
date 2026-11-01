import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Users, Search, ArrowLeft, Play, Plus, Shield, Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  DEPARTMENTS,
  WORKFORCE_TOOLS,
  workforceConfig,
  type WorkforceAgent,
  type WorkforceVersion,
  type WorkforceConfig,
} from "@/lib/workforce";
import { WORKFORCE_TEMPLATES } from "@/lib/workforce.templates";
import {
  listWorkforce,
  workforceOptions,
  setupWorkforce,
  saveWorkforce,
  activateWorkforce,
  enableWorkforce,
  launchWorkforce,
  getWorkforceChat,
  workforceActivity,
} from "@/lib/workforce.functions";
import { askAgentHelper } from "@/lib/agent-helper.functions";
import { saveAgentChat } from "@/lib/agent-chat.functions";
import { type ChatMessage, chatMessageSchema } from "@/lib/agent-chat";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type Location = { agent?: string; chat?: string; project?: string };
const field = "w-full rounded-md border bg-background px-3 py-2 text-sm";
const report = (error: unknown) =>
  toast.error(error instanceof Error ? error.message : "Action failed. Refresh and retry.");
const title = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export function WorkforceDirectory({
  location,
  navigate,
}: {
  location: Location;
  navigate: (value: Location) => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const list = useServerFn(listWorkforce),
    options = useServerFn(workforceOptions),
    setup = useServerFn(setupWorkforce),
    launch = useServerFn(launchWorkforce);
  const [query, setQuery] = useState(""),
    [department, setDepartment] = useState("all"),
    [departmentsView, setDepartmentsView] = useState(false),
    [builder, setBuilder] = useState<WorkforceAgent | "new" | null>(null);
  const projectId = location.project ?? null;
  const rows = useQuery({
    queryKey: ["workforce", user?.id, projectId],
    queryFn: () => list({ data: { projectId } }),
    enabled: !!user,
  });
  const opts = useQuery({
    queryKey: ["workforce-options", user?.id, projectId],
    queryFn: () => options({ data: { projectId, query: "" } }),
    enabled: !!user,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["workforce"] });
  };
  const install = useMutation({
    mutationFn: () => setup({ data: { projectId } }),
    onSuccess: (r) => {
      toast.success(`${r.added} private draft specialists added. Existing identities retained.`);
      refresh();
    },
    onError: report,
  });
  const start = useMutation({
    mutationFn: (id: string) => launch({ data: { id } }),
    onSuccess: (r, id) => navigate({ ...location, agent: id, chat: r.chatId }),
    onError: report,
  });
  const agents = rows.data?.agents ?? [],
    versions = rows.data?.versions ?? [];
  const newest = (a: WorkforceAgent) => versions.find((v) => v.agent_id === a.id);
  const selected = agents.find((a) => a.id === location.agent);
  const visible = agents.filter((a) => {
    const c = newest(a)?.config;
    return (
      (department === "all" || a.department === department) &&
      `${c?.name} ${c?.role} ${c?.description}`.toLowerCase().includes(query.toLowerCase())
    );
  });
  return (
    <div className="space-y-6">
      <header className="space-y-3 rounded-xl border bg-gradient-to-br from-primary/10 via-background to-background p-4 sm:p-6">
        <Badge variant="outline">
          <Shield className="mr-1 size-3" />
          Private AI workforce
        </Badge>
        <h1 className="text-2xl font-semibold sm:text-3xl">Specialists for your next mission</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Find your department leads and specialists, connect their apps, and launch private chats
          with controlled tool access.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={departmentsView ? "outline" : "default"}
            onClick={() => setDepartmentsView(false)}
          >
            <Users className="mr-2 size-4" />
            Workforce
          </Button>
          <Button
            size="sm"
            variant={departmentsView ? "default" : "outline"}
            onClick={() => setDepartmentsView(true)}
          >
            <Building2 className="mr-2 size-4" />
            Departments
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!rows.data?.canManage}
            onClick={() => setBuilder("new")}
          >
            <Plus className="mr-2 size-4" />
            Agent Builder
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/connections">Connect apps</Link>
          </Button>
        </div>
      </header>
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-56 flex-1 space-y-1">
          <span className="text-sm">Workspace</span>
          <select
            className={field}
            value={projectId ?? ""}
            onChange={(e) => navigate(e.target.value ? { project: e.target.value } : {})}
          >
            <option value="">Personal · private to you</option>
            {opts.data?.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-48 flex-1 space-y-1">
          <span className="text-sm flex items-center gap-1">
            <Search className="size-3" />
            Search specialists
          </span>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, role or expertise"
          />
        </label>
        <label className="space-y-1">
          <span className="text-sm">Department</span>
          <select
            className={field}
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          >
            <option value="all">All departments</option>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
                {title(d)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {rows.isLoading && <p role="status">Loading your workforce…</p>}
      {(rows.error || opts.error) && (
        <p role="alert" className="text-destructive">
          {(rows.error || opts.error)?.message}
        </p>
      )}
      {rows.data?.canManage && agents.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          disabled={install.isPending}
          onClick={() => install.mutate()}
        >
          {install.isPending ? "Setting up…" : "Add missing department templates"}
        </Button>
      )}
      {rows.data?.canManage && agents.length === 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border p-4">
          <Button size="sm" disabled={install.isPending} onClick={() => install.mutate()}>
            {install.isPending ? "Setting up…" : "Set up department templates"}
          </Button>
          <p className="text-xs text-muted-foreground">
            17 private drafts: ten department leads and seven Engineering specialists. Repeated
            setup preserves existing records.
          </p>
        </div>
      )}
      {departmentsView ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DEPARTMENTS.filter(
            (d) => !["business", "custom"].includes(d) || agents.some((a) => a.department === d),
          ).map((d) => (
            <Card className="space-y-2 p-4" key={d}>
              <Building2 className="size-5 text-primary" />
              <h2 className="font-semibold">{title(d)}</h2>
              <p className="text-sm text-muted-foreground">
                {agents.filter((a) => a.department === d).length} configured specialists ·{" "}
                {
                  agents.filter((a) => a.department === d && a.enabled && a.active_version_id)
                    .length
                }{" "}
                activated
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setDepartment(d);
                  setDepartmentsView(false);
                }}
              >
                Browse department
              </Button>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((a) => {
            const v = newest(a),
              c = v?.config;
            return (
              <Card key={a.id} className="flex flex-col gap-2 p-3">
                <div className="flex items-center justify-between">
                  <div className="rounded-lg bg-primary/10 p-2 text-primary">
                    <Users className="size-5" />
                  </div>
                  <Badge variant="outline">
                    {!a.enabled ? "Disabled" : a.active_version_id ? "Activated" : "Draft"}
                  </Badge>
                </div>
                <h2 className="font-semibold">{c?.name ?? a.slug}</h2>
                <p className="text-sm font-medium text-primary">
                  {c?.role}
                  {a.lead ? " · Department lead" : ""}
                </p>
                <p className="flex-1 text-sm text-muted-foreground">{c?.description}</p>
                <p className="text-xs text-muted-foreground">
                  {title(a.department)} · {projectId ? "Project access" : "Personal"} · v
                  {v?.number ?? 0}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      navigate({
                        ...(location.project ? { project: location.project } : {}),
                        agent: a.id,
                      })
                    }
                  >
                    View specialist
                  </Button>
                  <Button
                    size="sm"
                    disabled={!a.enabled || !a.active_version_id || start.isPending}
                    onClick={() => start.mutate(a.id)}
                  >
                    <Play className="mr-1 size-3" />
                    Launch chat
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {!rows.isLoading && !departmentsView && !visible.length && (
        <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
          No specialists match this view. Set up private templates or create a specialist.
        </p>
      )}
      {location.agent && !selected && !rows.isLoading && (
        <p role="alert">
          This specialist is not available in the selected workspace.{" "}
          <button
            className="underline"
            onClick={() => navigate(location.project ? { project: location.project } : {})}
          >
            Back to directory
          </button>
        </p>
      )}
      {selected && !location.chat && (
        <SpecialistProfile
          key={selected.id}
          agent={selected}
          versions={versions.filter((v) => v.agent_id === selected.id)}
          canManage={rows.data?.canManage ?? false}
          onClose={() => navigate(location.project ? { project: location.project } : {})}
          onEdit={() => setBuilder(selected)}
          onLaunch={() => start.mutate(selected.id)}
          launching={start.isPending}
          refresh={refresh}
          onChat={(chat) => navigate({ ...location, chat })}
        />
      )}
      {selected && location.chat && (
        <SpecialistChat
          key={`${user?.id}-${location.chat}`}
          agentId={selected.id}
          chatId={location.chat}
          onClose={() =>
            navigate({
              ...(location.project ? { project: location.project } : {}),
              agent: selected.id,
            })
          }
        />
      )}
      {builder && (
        <SpecialistBuilder
          key={builder === "new" ? `new-${projectId}` : newest(builder)?.id}
          agent={builder === "new" ? null : builder}
          version={builder === "new" ? undefined : newest(builder)}
          projectId={projectId}
          onClose={() => setBuilder(null)}
          onSaved={() => {
            setBuilder(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function SpecialistProfile({
  agent,
  versions,
  canManage,
  onClose,
  onEdit,
  onLaunch,
  launching,
  refresh,
  onChat,
}: {
  agent: WorkforceAgent;
  versions: WorkforceVersion[];
  canManage: boolean;
  onClose: () => void;
  onEdit: () => void;
  onLaunch: () => void;
  launching: boolean;
  refresh: () => void;
  onChat: (id: string) => void;
}) {
  const { user } = useAuth();
  const activate = useServerFn(activateWorkforce),
    enable = useServerFn(enableWorkforce),
    activity = useServerFn(workforceActivity);
  const active = versions.find((v) => v.id === agent.active_version_id),
    latest = versions[0],
    c = (active ?? latest)?.config;
  const history = useQuery({
    queryKey: ["workforce-activity", user?.id, agent.id],
    queryFn: () => activity({ data: { id: agent.id } }),
  });
  const change = useMutation({
    mutationFn: (versionId: string) =>
      activate({ data: { id: agent.id, versionId, expectedActive: agent.active_version_id } }),
    onSuccess: () => {
      toast.success("Specialist version activated");
      refresh();
    },
    onError: report,
  });
  const toggle = useMutation({
    mutationFn: () =>
      enable({
        data: { id: agent.id, enabled: !agent.enabled, expectedUpdatedAt: agent.updated_at },
      }),
    onSuccess: refresh,
    onError: report,
  });
  if (!c) return null;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{c.name}</DialogTitle>
          <DialogDescription>
            {c.role} · {title(c.department)} ·{" "}
            {agent.project_id ? "Project specialist" : "Private specialist"}
          </DialogDescription>
        </DialogHeader>
        <Button variant="ghost" onClick={onClose}>
          <ArrowLeft className="mr-2 size-4" />
          Back to workforce
        </Button>
        <p>{c.description}</p>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">
            {agent.enabled
              ? active
                ? `Active v${active.number}`
                : "Activation required"
              : "Disabled"}
          </Badge>
          <Badge variant="outline">Model: {c.model}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Launch checks your free model route, attached app status, resource access and current
          project grants. Activation alone does not prove live provider health.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!agent.enabled || !active || launching} onClick={onLaunch}>
            Launch private chat
          </Button>
          {canManage && (
            <>
              <Button variant="outline" onClick={onEdit}>
                Edit in Builder
              </Button>
              <Button variant="outline" disabled={toggle.isPending} onClick={() => toggle.mutate()}>
                {agent.enabled ? "Disable" : "Enable"}
              </Button>
            </>
          )}
          <Button
            variant="outline"
            onClick={() => {
              void navigator.clipboard
                .writeText(
                  `Open-Connect specialist: ${c.name}\nRole: ${c.role}\nConfiguration version: ${active?.number ?? latest?.number} (${active ? "active" : "draft"})\n${c.instructions}\nUse https://open-connect.site/mcp through your existing OAuth connection. Provider grants and approvals remain enforced. This handoff is not a persistent background worker.`,
                )
                .then(() => toast.success("Private specialist handoff copied"), report);
            }}
          >
            Copy ChatGPT handoff
          </Button>
        </div>
        <details className="rounded-lg border p-3">
          <summary className="cursor-pointer font-medium">
            Instructions and allowed capabilities
          </summary>
          <pre className="mt-3 whitespace-pre-wrap text-sm">{c.instructions}</pre>
          <p className="mt-3 text-sm">Tools: {c.tools.join(", ") || "Conversation only"}</p>
          <p className="text-sm">
            {c.skillIds.length} skill descriptions · {c.knowledgeIds.length} knowledge references ·{" "}
            {c.connectionIds.length} required apps
          </p>
          <p className="text-xs text-muted-foreground">
            Only selected knowledge excerpts and skill descriptions are loaded. Executable skill
            packages and external provider automation are not run by this chat.
          </p>
        </details>
        <section className="space-y-2">
          <h3 className="font-medium">Immutable configuration history</h3>
          {versions.map((v) => (
            <div
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
              key={v.id}
            >
              <span className="text-sm">
                v{v.number} · {new Date(v.created_at).toLocaleString()}{" "}
                {v.id === agent.active_version_id ? "· active" : ""}
              </span>
              {canManage && v.id !== agent.active_version_id && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={change.isPending}
                  onClick={() => change.mutate(v.id)}
                >
                  Activate v{v.number}
                </Button>
              )}
            </div>
          ))}
        </section>
        <section className="space-y-2">
          <h3 className="font-medium">Your conversations and activity</h3>
          {history.error && <p role="alert">{history.error.message}</p>}
          {history.data?.chats.map((chat) => (
            <Button
              className="mr-2"
              key={chat.id}
              variant="outline"
              onClick={() => onChat(chat.id)}
            >
              {chat.title} · {new Date(chat.updated_at).toLocaleDateString()}
            </Button>
          ))}
          {history.data?.events.map((event, i) => (
            <p key={i} className="text-xs text-muted-foreground">
              {event.state} · {event.model ?? "No model result"} · {event.latency_ms ?? 0} ms ·{" "}
              {new Date(event.created_at).toLocaleString()}
            </p>
          ))}
          <p className="text-xs text-muted-foreground">
            Chats are request-bound. Existing schedule tools retain their normal controls. Billing
            costs are not recorded; model routes must be catalog-verified free.
          </p>
        </section>
        <Button asChild variant="link">
          <Link to="/integrations" search={{ section: "api-key" }}>
            Developer API keys and app setup
          </Link>
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function SpecialistBuilder({
  agent,
  version,
  projectId,
  onClose,
  onSaved,
}: {
  agent: WorkforceAgent | null;
  version: WorkforceVersion | undefined;
  projectId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [draft, setDraft] = useState<WorkforceConfig>(
      version?.config ?? WORKFORCE_TEMPLATES[0]!.config,
    ),
    [slug, setSlug] = useState(agent?.slug ?? ""),
    [lead, setLead] = useState(agent?.lead ?? false),
    [search, setSearch] = useState("");
  const save = useServerFn(saveWorkforce),
    options = useServerFn(workforceOptions);
  const opts = useQuery({
    queryKey: ["workforce-builder-options", user?.id, projectId, search],
    queryFn: () => options({ data: { projectId, query: search } }),
  });
  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          id: agent?.id ?? null,
          slug,
          lead,
          projectId,
          expected: version?.number ?? null,
          config: workforceConfig.parse(draft),
        },
      }),
    onSuccess: () => {
      toast.success("New private version saved. Review and activate it to launch.");
      onSaved();
    },
    onError: report,
  });
  const update = <K extends keyof WorkforceConfig>(key: K, value: WorkforceConfig[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {agent ? "Edit specialist · new version" : "Create private specialist"}
          </DialogTitle>
          <DialogDescription>
            Settings stay private to this workspace. Credentials belong in Connections. Saving does
            not activate or publish an agent.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <label className="block space-y-1">
            <span className="text-sm font-medium">Name</span>
            <Input
              value={draft.name}
              maxLength={100}
              onChange={(e) => update("name", e.target.value)}
              required
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Stable identity</span>
            <Input
              disabled={!!agent}
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              pattern="[a-z0-9][a-z0-9-]{0,99}"
              placeholder="my-research-specialist"
              required
            />
            <p className="text-xs text-muted-foreground">
              Permanent identifier; changing the display name keeps this identity.
            </p>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-sm font-medium">Department</span>
              <select
                className={field}
                value={draft.department}
                onChange={(e) =>
                  update("department", e.target.value as WorkforceConfig["department"])
                }
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {title(d)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">Role</span>
              <Input
                value={draft.role}
                maxLength={100}
                onChange={(e) => update("role", e.target.value)}
                required
              />
            </label>
          </div>
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={lead}
              disabled={!!agent}
              onChange={(e) => setLead(e.target.checked)}
            />
            Department lead
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Description</span>
            <Textarea
              value={draft.description}
              maxLength={1200}
              onChange={(e) => update("description", e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Specialist instructions</span>
            <Textarea
              aria-label="Specialist instructions"
              value={draft.instructions}
              rows={7}
              minLength={10}
              maxLength={12000}
              onChange={(e) => update("instructions", e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Do not paste passwords, API keys or session material. Platform permissions always
              apply.
            </p>
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Model route</span>
            <Input
              value={draft.model}
              onChange={(e) => update("model", e.target.value)}
              placeholder="auto-free"
            />
            <p className="text-xs text-muted-foreground">
              Use auto-free or an exact connected, verified free model ID. Launch checks
              availability.
            </p>
          </label>
          <fieldset className="space-y-2 rounded-lg border p-3">
            <legend className="px-1 text-sm">Allowed internal capabilities</legend>
            {WORKFORCE_TOOLS.map((tool) => (
              <label key={tool} className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.tools.includes(tool)}
                  onChange={(e) =>
                    update(
                      "tools",
                      e.target.checked
                        ? [...draft.tools, tool]
                        : draft.tools.filter((t) => t !== tool),
                    )
                  }
                />
                {tool.replaceAll("_", " ")}
              </label>
            ))}
            <p className="text-xs text-muted-foreground">
              Existing tool validation and user/project permissions remain enforced. Project
              specialists cannot use personal-only capabilities.
            </p>
          </fieldset>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Find skill and knowledge references</span>
            <Input
              value={search}
              maxLength={100}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name"
            />
          </label>
          {opts.error && <p role="alert">{opts.error.message}</p>}
          {opts.data && (
            <>
              <label className="block space-y-1">
                <span className="text-sm font-medium">Skill descriptions</span>
                <select
                  multiple
                  className={field}
                  value={draft.skillIds}
                  onChange={(e) => {
                    const shown = opts
                      .data!.resources.filter((r) => r.resource_type === "skill")
                      .map((r) => r.id);
                    update("skillIds", [
                      ...draft.skillIds.filter((id) => !shown.includes(id)),
                      ...Array.from(e.target.selectedOptions, (o) => o.value),
                    ]);
                  }}
                >
                  {opts.data.resources
                    .filter((r) => r.resource_type === "skill")
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">Knowledge sources</span>
                <select
                  multiple
                  className={field}
                  value={draft.knowledgeIds}
                  onChange={(e) => {
                    const shown = opts.data!.knowledge.map((r) => r.id);
                    update("knowledgeIds", [
                      ...draft.knowledgeIds.filter((id) => !shown.includes(id)),
                      ...Array.from(e.target.selectedOptions, (o) => o.value),
                    ]);
                  }}
                >
                  {opts.data.knowledge.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">Required apps</span>
                <select
                  multiple
                  className={field}
                  value={draft.connectionIds}
                  onChange={(e) =>
                    update(
                      "connectionIds",
                      Array.from(e.target.selectedOptions, (o) => o.value),
                    )
                  }
                >
                  {opts.data.connections.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.display_name} · {r.status}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  App references are readiness requirements. This release does not invoke external
                  provider actions from specialist chat.
                </p>
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">Reuse an existing agent resource</span>
                <select
                  className={field}
                  disabled={!!agent}
                  value={draft.sourceResourceId ?? ""}
                  onChange={(e) => update("sourceResourceId", e.target.value || null)}
                >
                  <option value="">No source resource</option>
                  {opts.data.resources
                    .filter((r) => r.resource_type === "agent")
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                </select>
              </label>
            </>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save private version"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SpecialistChat({
  chatId,
  agentId,
  onClose,
}: {
  chatId: string;
  agentId: string;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const get = useServerFn(getWorkforceChat);
  const loaded = useQuery({
    queryKey: ["workforce-chat", user?.id, chatId, agentId],
    queryFn: () => get({ data: { chatId, agentId } }),
    enabled: !!user,
    retry: false,
    refetchOnWindowFocus: false,
  });
  if (loaded.data)
    return (
      <SpecialistChatSession
        key={`${user?.id}-${chatId}`}
        chatId={chatId}
        data={loaded.data}
        onClose={onClose}
      />
    );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Specialist chat</DialogTitle>
          <DialogDescription>
            {loaded.error?.message ?? "Loading your private conversation…"}
          </DialogDescription>
        </DialogHeader>
        <Button variant="outline" onClick={onClose}>
          Back to specialist
        </Button>
      </DialogContent>
    </Dialog>
  );
}
function SpecialistChatSession({
  chatId,
  data,
  onClose,
}: {
  chatId: string;
  data: Awaited<ReturnType<typeof getWorkforceChat>>;
  onClose: () => void;
}) {
  const ask = useServerFn(askAgentHelper),
    save = useServerFn(saveAgentChat);
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
      (data.chat.messages as unknown[]).map((m) => chatMessageSchema.parse(m)),
    ),
    [draft, setDraft] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const revision = useRef<number | null>(data.chat.revision),
    sending = useRef(false),
    present = useRef(true);
  useEffect(() => {
    present.current = true;
    return () => {
      present.current = false;
    };
  }, []);
  async function send() {
    if (sending.current || !draft.trim() || revision.current === null) return;
    sending.current = true;
    setBusy(true);
    setError("");
    const next: ChatMessage[] = [...messages, { role: "user", content: draft.trim() }];
    try {
      const first = await save({
        data: {
          id: chatId,
          revision: revision.current,
          title: data.chat.title,
          messages: next,
          mode: "workspace",
          browser_run_id: null,
        },
      });
      if (!present.current) return;
      revision.current = first.revision;
      setMessages(next);
      setDraft("");
      const result = await ask({ data: { messages: next, workforceChatId: chatId } });
      if (!present.current) return;
      const complete: ChatMessage[] = [...next, { role: "assistant", content: result.reply }];
      setMessages(complete); // Keep the actual reply visible even if persistence conflicts.
      const final = await save({
        data: {
          id: chatId,
          revision: revision.current,
          title: data.chat.title,
          messages: complete,
          mode: "workspace",
          browser_run_id: null,
        },
      });
      if (!present.current) return;
      revision.current = final.revision;
      setMessages(complete);
    } catch (failure) {
      if (present.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "Reply failed. Refresh history before retrying.",
        );
    } finally {
      sending.current = false;
      if (present.current) setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{data.version.config.name ?? "Specialist chat"}</DialogTitle>
          <DialogDescription>
            Private conversation · pinned to v{data.version.number ?? "…"}. Provider grants and tool
            approvals remain enforced.
          </DialogDescription>
        </DialogHeader>
        <Button variant="ghost" disabled={busy} onClick={onClose}>
          <ArrowLeft className="mr-2 size-4" />
          Back to specialist
        </Button>

        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        <div className="min-h-32 flex-1 space-y-3 overflow-y-auto" aria-live="polite">
          {messages.map((m, i) => (
            <div key={i} className={`rounded-lg border p-3 ${m.role === "user" ? "bg-muted" : ""}`}>
              <p className="mb-1 text-xs font-medium">
                {m.role === "user" ? "You" : data.version.config.name}
              </p>
              <p className="whitespace-pre-wrap break-words text-sm">{m.content}</p>
            </div>
          ))}
          {busy && (
            <p role="status" className="flex items-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" />
              Preparing reply…
            </p>
          )}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="space-y-2"
        >
          <Textarea
            aria-label="Message the specialist"
            value={draft}
            maxLength={5000}
            disabled={busy || !data.agent.enabled}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Give this specialist one concrete task…"
          />
          <Button type="submit" disabled={busy || !data.agent.enabled || !draft.trim()}>
            Send message
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
