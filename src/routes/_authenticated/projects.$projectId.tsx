import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FolderKanban, Layers, Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  ensureProjectEnvironments,
  listProjectEnvironments,
  listProjects,
} from "@/lib/orgs.functions";
import {
  addConnectionToProject,
  addResourceToProject,
  listCatalogForProject,
  listMyConnections,
  listProjectConnections,
  listProjectResources,
  removeConnectionFromProject,
  removeResourceFromProject,
} from "@/lib/workspace.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  head: () => ({
    meta: [
      { title: "Project workspace — Open-Connect" },
      {
        name: "description",
        content:
          "Project-scoped environments, agents, skills, plugins, prompts, OAuth connections, and vaults.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProjectWorkspacePage,
});

const TYPE_FILTERS = [
  "all",
  "agent",
  "skill",
  "plugin",
  "prompt",
  "mcp",
  "tool",
  "app",
  "model",
] as const;

function ProjectWorkspacePage() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();

  const listProj = useServerFn(listProjects);
  const listEnvs = useServerFn(listProjectEnvironments);
  const ensureEnvs = useServerFn(ensureProjectEnvironments);
  const listRes = useServerFn(listProjectResources);
  const listConn = useServerFn(listProjectConnections);
  const listCat = useServerFn(listCatalogForProject);
  const listMyConn = useServerFn(listMyConnections);
  const addRes = useServerFn(addResourceToProject);
  const remRes = useServerFn(removeResourceFromProject);
  const addConn = useServerFn(addConnectionToProject);
  const remConn = useServerFn(removeConnectionFromProject);

  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [pickResource, setPickResource] = useState("");
  const [pickConnection, setPickConnection] = useState("");

  const projects = useQuery({ queryKey: ["projects"], queryFn: () => listProj({}) });
  const project = (projects.data ?? []).find((p) => p.id === projectId);

  const environments = useQuery({
    queryKey: ["project-environments", projectId],
    queryFn: () => listEnvs({ data: { projectId } }),
    enabled: Boolean(projectId),
  });

  const ensureEnvMut = useMutation({
    mutationFn: () => ensureEnvs({ data: { projectId } }),
    onSuccess: () => {
      toast.success("Environments ready");
      void qc.invalidateQueries({ queryKey: ["project-environments", projectId] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Could not seed environments"),
  });

  const resources = useQuery({
    queryKey: ["project-resources", projectId],
    queryFn: () => listRes({ data: { projectId } }),
    enabled: Boolean(projectId),
  });
  const connections = useQuery({
    queryKey: ["project-connections", projectId],
    queryFn: () => listConn({ data: { projectId } }),
    enabled: Boolean(projectId),
  });
  const catalog = useQuery({
    queryKey: ["catalog-for-project", typeFilter],
    queryFn: () =>
      listCat({
        data: typeFilter === "all" ? {} : { resourceType: typeFilter },
      }),
  });
  const myConnections = useQuery({
    queryKey: ["my-connections"],
    queryFn: () => listMyConn({}),
  });

  const addResMut = useMutation({
    mutationFn: () => addRes({ data: { projectId, resourceId: pickResource } }),
    onSuccess: () => {
      toast.success("Added to project");
      setPickResource("");
      void qc.invalidateQueries({ queryKey: ["project-resources", projectId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const remResMut = useMutation({
    mutationFn: (resourceId: string) => remRes({ data: { projectId, resourceId } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["project-resources", projectId] }),
  });

  const addConnMut = useMutation({
    mutationFn: () => addConn({ data: { projectId, connectionId: pickConnection } }),
    onSuccess: () => {
      toast.success("Connection scoped to project");
      setPickConnection("");
      void qc.invalidateQueries({ queryKey: ["project-connections", projectId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const remConnMut = useMutation({
    mutationFn: (connectionId: string) => remConn({ data: { projectId, connectionId } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["project-connections", projectId] }),
  });

  if (!project && !projects.isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-sm text-muted-foreground">Project not found.</p>
        <Button asChild className="mt-4" variant="outline">
          <Link to="/projects">Back to projects</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Badge variant="outline" className="mb-2 border-primary/40 text-primary">
            <FolderKanban className="mr-1 size-3" /> Project workspace
          </Badge>
          <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
            {project?.name ?? "…"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {(project as { organizations?: { name?: string } } | undefined)?.organizations?.name ??
              "Organization"}{" "}
            · environments · agents · skills · OAuth · vault
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link to="/projects">All projects</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/resources">Marketplace</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/studio">Studio</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/secrets">Vault</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/api-keys">API keys</Link>
          </Button>
        </div>
      </div>

      <Card className="shadow-panel">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Layers className="size-4 text-primary" />
                Environments
              </CardTitle>
              <CardDescription>
                Development · Staging · Production — scope credentials, policies, and deploys.
                Secrets stay in the broker.
              </CardDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={ensureEnvMut.isPending}
              onClick={() => ensureEnvMut.mutate()}
            >
              {ensureEnvMut.isPending ? (
                <Loader2 className="mr-1 size-3.5 animate-spin" />
              ) : (
                <Plus className="mr-1 size-3.5" />
              )}
              Ensure Dev / Staging / Prod
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {environments.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading environments…</p>
          ) : (environments.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No environments yet — click Ensure to seed Development, Staging, and Production.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-3">
              {(environments.data ?? []).map((env) => (
                <div
                  key={env.id}
                  className="rounded-lg border border-border/80 bg-card/40 px-3 py-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{env.name}</p>
                    {env.is_default ? (
                      <Badge variant="secondary" className="text-[10px]">
                        default
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">{env.slug}</p>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {env.slug === "production"
                      ? "Elevated risk — prefer approval for writes"
                      : env.slug === "staging"
                        ? "Pre-production validation"
                        : "Local and experimental work"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-panel">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Add from marketplace catalog</CardTitle>
          <CardDescription>
            Attach agents, skills, plugins, prompts, MCP, tools to this project only.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {TYPE_FILTERS.map((t) => (
              <Button
                key={t}
                size="sm"
                variant={typeFilter === t ? "default" : "outline"}
                onClick={() => setTypeFilter(t)}
              >
                {t}
              </Button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1 space-y-1">
              <Label htmlFor="pick-res">Catalog item</Label>
              <select
                id="pick-res"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={pickResource}
                onChange={(e) => setPickResource(e.target.value)}
              >
                <option value="">Select resource…</option>
                {(catalog.data ?? []).map((r: { id: string; name?: string; resource_type?: string }) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.resource_type})
                  </option>
                ))}
              </select>
            </div>
            <Button
              disabled={!pickResource || addResMut.isPending}
              onClick={() => addResMut.mutate()}
            >
              {addResMut.isPending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
              Add to project
            </Button>
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Project catalog ({resources.data?.length ?? 0})
        </h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {(resources.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No packages linked yet — add from the catalog or marketplace.
            </p>
          ) : (
            resources.data?.map((row: { id: string; resources?: { id?: string; name?: string; resource_type?: string; version?: string; description?: string } | null }) => {
              const r = row.resources;
              return (
                <Card key={row.id} className="p-4 shadow-panel">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{r?.name ?? "Resource"}</p>
                        <Badge variant="secondary" className="text-[10px] uppercase">
                          {r?.resource_type}
                        </Badge>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {r?.description || r?.version || ""}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => r?.id && remResMut.mutate(r.id)}
                      aria-label="Remove"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </div>

      <Card className="shadow-panel">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">OAuth · MCP accounts (project-separated)</CardTitle>
          <CardDescription>
            Scope connected accounts to this project so environments stay isolated.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1 space-y-1">
              <Label htmlFor="pick-conn">Your connection</Label>
              <select
                id="pick-conn"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={pickConnection}
                onChange={(e) => setPickConnection(e.target.value)}
              >
                <option value="">Select connection…</option>
                {(myConnections.data ?? []).map((c: { id: string; display_name?: string; provider?: string }) => (
                  <option key={c.id} value={c.id}>
                    {c.display_name || c.provider} ({c.provider})
                  </option>
                ))}
              </select>
            </div>
            <Button
              disabled={!pickConnection || addConnMut.isPending}
              onClick={() => addConnMut.mutate()}
            >
              {addConnMut.isPending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
              Scope to project
            </Button>
          </div>
          <div className="space-y-2">
            {(connections.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No connections scoped to this project yet.</p>
            ) : (
              (connections.data ?? []).map((row: { id: string; connection_id?: string; app_connections?: { display_name?: string; provider?: string; status?: string } | null }) => {
                const c = row.app_connections;
                return (
                  <div
                    key={row.id}
                    className="flex items-center justify-between rounded-lg border border-border/80 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium">{c?.display_name || c?.provider}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {c?.provider} · {c?.status}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => row.connection_id && remConnMut.mutate(row.connection_id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
