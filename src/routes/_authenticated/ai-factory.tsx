import { factorySearch } from "@/lib/ai-factory-navigation";
import { WorkforceDirectory } from "@/components/workforce-directory";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Archive, Loader2, Play, Plus, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  FACTORY_CATEGORIES,
  FACTORY_TEMPLATES,
  factoryRoles,
  factoryCategoryLabel,
  factoryRunTranscript,
  type FactoryTeam,
  type FactoryTeamDraft,
} from "@/lib/ai-factory";
import {
  listFactoryTeams,
  saveFactoryTeam,
  archiveFactoryTeam,
  factoryReadiness,
  listFactoryRuns,
  runFactoryTeam,
} from "@/lib/ai-factory.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/ai-factory")({
  validateSearch: factorySearch,
  head: () => ({
    meta: [{ title: "AI Factory — Open-Connect" }, { name: "robots", content: "noindex" }],
  }),
  component: FactoryPage,
});
const emptyDraft: FactoryTeamDraft = {
  name: "",
  category: "development",
  description: "",
  roles: ["Software Architect", "Developer", "QA Reviewer"],
};
function RosterFrame() {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <iframe
        title="AI Factory roster, teams and playbooks"
        src="/ai-factory/roster/index.html"
        className="h-[calc(100vh-13rem)] min-h-[640px] w-full"
        loading="lazy"
      />
    </div>
  );
}

function FactoryPage() {
  const { user } = useAuth();
  const search = Route.useSearch();
  const navigate = useNavigate();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={search.view === "teams" ? "outline" : "default"}
          onClick={() => void navigate({ to: "/ai-factory", search: {} })}
        >
          Workforce Directory
        </Button>
        <Button
          size="sm"
          variant={search.view === "teams" ? "default" : "outline"}
          onClick={() => void navigate({ to: "/ai-factory", search: { view: "teams" } })}
        >
          Existing teams & proposal runs
        </Button>
        <Button
          size="sm"
          variant={search.view === "roster" ? "default" : "outline"}
          onClick={() => void navigate({ to: "/ai-factory", search: { view: "roster" } })}
        >
          Roster & playbooks
        </Button>
      </div>
      {search.view === "roster" ? (
        <RosterFrame />
      ) : search.view === "teams" ? (
        <FactoryWorkspace key={user?.id ?? "signed-out"} userId={user?.id} />
      ) : (
        <WorkforceDirectory
          key={user?.id ?? "signed-out"}
          location={search}
          navigate={(value) => void navigate({ to: "/ai-factory", search: value })}
        />
      )}
    </div>
  );
}
function FactoryWorkspace({ userId }: { userId: string | undefined }) {
  const qc = useQueryClient();
  const list = useServerFn(listFactoryTeams),
    save = useServerFn(saveFactoryTeam),
    archive = useServerFn(archiveFactoryTeam),
    readiness = useServerFn(factoryReadiness),
    history = useServerFn(listFactoryRuns),
    run = useServerFn(runFactoryTeam);
  const [draft, setDraft] = useState<FactoryTeamDraft>(emptyDraft);
  const [roleText, setRoleText] = useState(emptyDraft.roles.join("\n"));
  const rolesValidation = factoryRoles.safeParse(
    roleText
      .split("\n")
      .map((role) => role.trim())
      .filter(Boolean),
  );
  const [editing, setEditing] = useState<FactoryTeam | null>(null);
  const [category, setCategory] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [goal, setGoal] = useState(""),
    [context, setContext] = useState("");
  const teams = useQuery({
    queryKey: ["factory-teams", userId, category, showArchived],
    queryFn: () =>
      list({ data: { archived: showArchived, ...(category === "all" ? {} : { category }) } }),
    enabled: !!userId,
  });
  const models = useQuery({
    queryKey: ["factory-readiness", userId],
    queryFn: () => readiness({}),
    enabled: !!userId,
    staleTime: 60000,
  });
  const runs = useQuery({
    queryKey: ["factory-runs", userId, selectedId],
    queryFn: () => history({ data: { teamId: selectedId } }),
    enabled: !!userId && !!selectedId,
    refetchInterval: 15000,
  });
  const selected = teams.data?.find((team) => team.id === selectedId);
  const refreshTeams = () => qc.invalidateQueries({ queryKey: ["factory-teams", userId] });
  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          team: {
            ...draft,
            roles: roleText
              .split("\n")
              .map((role) => role.trim())
              .filter(Boolean),
          },
          ...(editing ? { id: editing.id, expectedUpdatedAt: editing.updated_at } : {}),
        },
      }),
    onSuccess: (result) => {
      setSelectedId(result.id);
      setCategory("all");
      setShowArchived(editing?.archived ?? false);
      setEditing(null);
      setDraft(emptyDraft);
      setRoleText(emptyDraft.roles.join("\n"));
      void refreshTeams();
      toast.success("Private team saved");
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Could not save team");
      void refreshTeams();
    },
  });
  const archiveMutation = useMutation({
    mutationFn: (team: FactoryTeam) =>
      archive({
        data: { id: team.id, archived: !team.archived, expectedUpdatedAt: team.updated_at },
      }),
    onSuccess: () => {
      void refreshTeams();
      toast.success("Team updated");
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Could not update team");
      void refreshTeams();
    },
  });
  const runMutation = useMutation({
    mutationFn: () => run({ data: { teamId: selectedId, goal, context } }),
    onSuccess: (result) =>
      toast[result.state === "succeeded" ? "success" : "warning"](
        result.state === "succeeded"
          ? "Team proposals are ready"
          : "Some team roles were unavailable. Review the saved results.",
      ),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Team request failed"),
    onSettled: () => void qc.invalidateQueries({ queryKey: ["factory-runs", userId, selectedId] }),
  });
  const loadDraft = (team: FactoryTeamDraft, current: FactoryTeam | null = null) => {
    setDraft({
      name: team.name,
      category: team.category,
      description: team.description,
      roles: [...team.roles],
    });
    setRoleText(team.roles.join("\n"));
    setEditing(current);
  };
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <UsersRound className="size-6 text-primary" /> AI Factory
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Build private AI teams for development, business, research and everyday operations. Each
          role contributes a proposal through your connected free models.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="outline">Mode: proposal generation</Badge>
          <Button size="sm" variant="outline" asChild>
            <Link to="/cloud-browser">Open Cloud Browser</Link>
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <Link to="/connections">Connectors</Link>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          External app actions use a separate approved execution workflow. Model availability and
          free-provider rate limits apply.
        </p>
      </header>
      <section aria-labelledby="factory-templates" className="space-y-3">
        <h2 id="factory-templates" className="font-semibold">
          Start with a team template
        </h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {FACTORY_TEMPLATES.map((team) => (
            <button
              type="button"
              key={team.category}
              className="space-y-2 rounded-xl border bg-card p-3 text-left transition hover:border-primary/60 focus-visible:outline focus-visible:outline-2"
              disabled={runMutation.isPending}
              onClick={() => loadDraft(team)}
            >
              <Badge variant="outline">{factoryCategoryLabel(team.category)}</Badge>
              <span className="block text-sm font-semibold">{team.name}</span>
              <span className="block text-xs text-muted-foreground">{team.description}</span>
              <span className="block text-xs text-muted-foreground">{team.roles.join(" · ")}</span>
            </button>
          ))}
        </div>
      </section>
      <Card className="space-y-3 p-3 sm:p-4">
        <h2 className="font-semibold">{editing ? "Edit team" : "Create a private team"}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="factory-name">Team name</Label>
            <Input
              id="factory-name"
              maxLength={100}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="My development team"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="factory-category">Category</Label>
            <select
              id="factory-category"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={draft.category}
              onChange={(e) =>
                setDraft({ ...draft, category: e.target.value as FactoryTeamDraft["category"] })
              }
            >
              {FACTORY_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {factoryCategoryLabel(value)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="factory-description">Team purpose</Label>
            <Textarea
              id="factory-description"
              maxLength={2000}
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="factory-roles">Agent roles, one per line</Label>
            <Textarea
              id="factory-roles"
              maxLength={500}
              value={roleText}
              onChange={(e) => setRoleText(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {rolesValidation.success
                ? "Use 2–6 different role names, up to 80 characters each."
                : rolesValidation.error.issues[0]?.message}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={
              !draft.name.trim() ||
              !rolesValidation.success ||
              saveMutation.isPending ||
              runMutation.isPending
            }
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            {editing ? "Save changes" : "Create team"}
          </Button>
          {editing ? (
            <Button size="sm" variant="outline" onClick={() => loadDraft(emptyDraft)}>
              Cancel edit
            </Button>
          ) : null}
        </div>
      </Card>
      <section className="space-y-3" aria-labelledby="factory-saved">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="factory-saved" className="font-semibold">
            Your teams
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <select
              aria-label="Filter team category"
              disabled={runMutation.isPending}
              className="h-8 rounded-md border bg-background px-2 text-sm"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setSelectedId("");
              }}
            >
              <option value="all">All categories</option>
              {FACTORY_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {factoryCategoryLabel(value)}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showArchived}
                disabled={runMutation.isPending}
                onChange={(e) => {
                  setShowArchived(e.target.checked);
                  setSelectedId("");
                }}
              />{" "}
              Show archived
            </label>
          </div>
        </div>
        {teams.isPending ? <p role="status">Loading teams…</p> : null}
        {teams.isError ? (
          <p role="alert">
            Could not load teams.{" "}
            <Button variant="link" onClick={() => void teams.refetch()}>
              Retry
            </Button>
          </p>
        ) : null}
        {!teams.isPending && !teams.isError && (teams.data ?? []).length === 0 ? (
          <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
            No matching teams. Choose a template above to create one.
          </p>
        ) : null}
        <div className="grid gap-2 sm:grid-cols-2">
          {(teams.data ?? []).map((team) => (
            <Card
              key={team.id}
              className={`min-w-0 space-y-2 p-3 ${selectedId === team.id ? "border-primary/60" : ""}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="min-w-0 font-semibold [overflow-wrap:anywhere]">{team.name}</h3>
                <Badge variant="outline">{factoryCategoryLabel(team.category)}</Badge>
                {team.archived ? <Badge variant="secondary">Archived</Badge> : null}
              </div>
              <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
                {team.description}
              </p>
              <div className="flex flex-wrap gap-2">
                {team.roles.map((role) => (
                  <Badge
                    key={role}
                    variant="secondary"
                    className="max-w-full whitespace-normal [overflow-wrap:anywhere]"
                  >
                    {role}
                  </Badge>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={selectedId === team.id ? "secondary" : "outline"}
                  disabled={runMutation.isPending}
                  onClick={() => setSelectedId(team.id)}
                >
                  Select team
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={runMutation.isPending}
                  onClick={() => loadDraft(team, team)}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={archiveMutation.isPending || runMutation.isPending}
                  onClick={() => archiveMutation.mutate(team)}
                >
                  <Archive className="size-3.5" />
                  {team.archived ? "Restore" : "Archive"}
                </Button>
              </div>
            </Card>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Up to 100 recently updated teams matching these filters are shown. Archived teams can be
          restored.
        </p>
      </section>
      <Card className="space-y-3 p-3 sm:p-4">
        <h2 className="font-semibold [overflow-wrap:anywhere]">
          {selected ? `Work with ${selected.name}` : "Select a saved team to begin"}
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="outline">
            {models.isPending
              ? "Checking models…"
              : models.isError
                ? "Model status unavailable"
                : `${models.data?.routes ?? 0} catalog-verified free routes`}
          </Badge>
          <Button variant="link" size="sm" asChild>
            <Link to="/models">AI Gateway</Link>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void models.refetch()}>
            Refresh models
          </Button>
        </div>
        <div className="space-y-2">
          <Label htmlFor="factory-goal">Team goal</Label>
          <Textarea
            id="factory-goal"
            maxLength={4000}
            value={goal}
            disabled={runMutation.isPending}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Describe the outcome and what a useful result should include."
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="factory-context">Context to share with the team</Label>
          <Textarea
            id="factory-context"
            maxLength={24000}
            value={context}
            disabled={runMutation.isPending}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Add the relevant brief, constraints and evidence. Omit credentials."
          />
          <p className="text-xs text-muted-foreground">
            Your goal, entered context and team role names are sent to the selected model providers.
            Common credential patterns are redacted.
          </p>
        </div>
        <Button
          size="sm"
          disabled={
            !selected ||
            selected.archived ||
            !goal.trim() ||
            runMutation.isPending ||
            !models.data?.routes
          }
          onClick={() => runMutation.mutate()}
        >
          {runMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Play className="size-4" />
          )}
          {runMutation.isPending ? "Generating team proposals…" : "Generate team proposals"}
        </Button>
      </Card>
      {selectedId ? (
        <section className="space-y-3" aria-labelledby="factory-history">
          <h2 id="factory-history" className="font-semibold">
            Private team history
          </h2>
          {runs.isPending ? <p role="status">Loading history…</p> : null}
          {runs.isError ? (
            <p role="alert">
              Could not load history.{" "}
              <Button variant="link" onClick={() => void runs.refetch()}>
                Retry
              </Button>
            </p>
          ) : null}
          {runs.data?.length === 0 ? (
            <p className="text-sm text-muted-foreground">No team runs yet.</p>
          ) : null}
          {runs.data?.map((item) => (
            <details
              key={item.id}
              className="rounded-xl border p-3"
              open={item.id === runMutation.data?.id}
            >
              <summary className="cursor-pointer text-sm font-medium">
                {item.state === "succeeded"
                  ? "Proposals ready"
                  : item.state === "running"
                    ? "In progress"
                    : "Needs attention"}{" "}
                · {new Date(item.created_at).toLocaleString()}
              </summary>
              <p className="mt-3 whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">
                {item.goal}
              </p>
              {item.evidence.workers?.length ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(factoryRunTranscript(item));
                      toast.success("Team outputs copied");
                    } catch {
                      toast.error("Copy is unavailable. Select the outputs below to copy them.");
                    }
                  }}
                >
                  Copy outputs
                </Button>
              ) : null}
              {item.evidence.workers?.map((worker) => (
                <article key={worker.role} className="mt-3 space-y-2 rounded-lg border p-3">
                  <h3 className="text-sm font-semibold [overflow-wrap:anywhere]">
                    {worker.role} ·{" "}
                    {worker.status === "completed" ? "Proposal generated" : "Unavailable"}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {worker.provider ?? "No available provider"}
                    {worker.model ? ` · ${worker.model}` : ""}
                  </p>
                  <p className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">
                    {worker.content}
                  </p>
                </article>
              ))}
              {item.evidence.error ? (
                <p role="alert" className="mt-3 text-sm text-destructive">
                  {item.evidence.error}
                </p>
              ) : null}
              {item.state === "running" ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Completion is not yet verified. If this remains after refreshing, the request may
                  have been interrupted.
                </p>
              ) : null}
            </details>
          ))}
        </section>
      ) : null}
    </div>
  );
}
