import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FolderKanban, Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { listProjects } from "@/lib/orgs.functions";
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
        content: "Project-scoped agents, skills, plugins, prompts, OAuth connections, and vaults.",
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
            · isolated agents · skills · plugins · OAuth · vault
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

      {/* Add catalog item */}
      <Card className="shadow-panel">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Add from marketplace catalog</CardTitle>
          <CardDescription>
            Attach agents, skills, plugins, prompts, MCP, tools to this project only.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-2">
            <Label>Type</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              {TYPE_FILTERS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Resource</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={pickResource}
              onChange={(e) => setPickResource(e.target.value)}
            >
              <option value="">Select…</option>
              {(catalog.data ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  [{r.resource_type}] {r.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button
              className="w-full"
              disabled={!pickResource || addResMut.isPending}
              onClick={() => addResMut.mutate()}
            >
              {addResMut.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              Add to project
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Linked resources */}
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
            resources.data?.map((row) => {
              const r = row.resources as {
                id?: string;
                name?: string;
                resource_type?: string;
                version?: string;
                description?: string;
              } | null;
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

      {/* OAuth / MCP connections */}
      <Card className="shadow-panel">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">OAuth · MCP accounts (project-separated)</CardTitle>
          <CardDescription>
            Scope connected accounts to this project so Development vs Business stay isolated.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-2">
              <Label>Your connection</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={pickConnection}
                onChange={(e) => setPickConnection(e.target.value)}
              >
                <option value="">Select…</option>
                {(myConnections.data ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.display_name || c.provider} · {c.status}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Button
                className="w-full"
                disabled={!pickConnection || addConnMut.isPending}
                onClick={() => addConnMut.mutate()}
              >
                Scope to project
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            {(connections.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No connections scoped. Connect apps under Connections, then attach here.
              </p>
            ) : (
              connections.data?.map((row) => {
                const c = row.app_connections as {
                  id?: string;
                  provider?: string;
                  display_name?: string;
                  status?: string;
                } | null;
                return (
                  <div
                    key={row.id}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                  >
                    <p className="text-sm">
                      {c?.display_name || c?.provider}{" "}
                      <span className="text-xs text-muted-foreground">· {c?.status}</span>
                    </p>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => c?.id && remConnMut.mutate(c.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                );
              })
            )}
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to="/connections">Manage connections</Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-pillar">
        <CardHeader className="p-5">
          <CardTitle className="text-base">Project isolation tips</CardTitle>
          <CardDescription>
            Use separate projects (e.g. Development, Business). Each can have its own catalog pack,
            OAuth accounts, API keys, and Secrets vault entries. Point MCP clients at the same
            gateway with project-scoped keys when you mint them under API keys.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
