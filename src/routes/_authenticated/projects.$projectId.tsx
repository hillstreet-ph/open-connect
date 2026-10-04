import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FolderKanban, Layers, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  ensureProjectEnvironments,
  deleteProject,
  listProjectEnvironments,
  listProjects,
  listMyProjectMemberships,
  renameProject,
} from "@/lib/orgs.functions";
import {
  addCredentialToProject,
  addConnectionToProject,
  listMyConnections,
  listMyCredentialMetadata,
  listProjectConnections,
  listProjectCredentials,
  listProjectResources,
  removeConnectionFromProject,
  removeCredentialFromProject,
} from "@/lib/workspace.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRoles } from "@/hooks/use-roles";
import { groupProjectResources } from "@/lib/resource-categories";
import { listKnowledge, listMemories } from "@/lib/memory.functions";

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

function ProjectWorkspacePage() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { isAdmin } = useRoles();

  const listProj = useServerFn(listProjects);
  const listMemberships = useServerFn(listMyProjectMemberships);
  const listEnvs = useServerFn(listProjectEnvironments);
  const ensureEnvs = useServerFn(ensureProjectEnvironments);
  const deleteProj = useServerFn(deleteProject);
  const renameProj = useServerFn(renameProject);
  const listRes = useServerFn(listProjectResources);
  const listConn = useServerFn(listProjectConnections);
  const listMyConn = useServerFn(listMyConnections);
  const listMyCred = useServerFn(listMyCredentialMetadata);
  const listProjCred = useServerFn(listProjectCredentials);
  const addConn = useServerFn(addConnectionToProject);
  const remConn = useServerFn(removeConnectionFromProject);
  const addCred = useServerFn(addCredentialToProject);
  const remCred = useServerFn(removeCredentialFromProject);
  const getMemories = useServerFn(listMemories);
  const getKnowledge = useServerFn(listKnowledge);

  const [pickConnection, setPickConnection] = useState("");
  const [pickCredential, setPickCredential] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const projects = useQuery({ queryKey: ["projects"], queryFn: () => listProj({}) });
  const project = (projects.data ?? []).find((p) => p.id === projectId);
  const memberships = useQuery({
    queryKey: ["my-project-memberships"],
    queryFn: () => listMemberships(),
  });
  const hasProjectAdmin = (memberships.data ?? []).some(
    (membership) => membership.project_id === projectId && membership.role === "admin",
  );
  const canManageProjectSettings = isAdmin || hasProjectAdmin;

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
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not seed environments"),
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
  const myConnections = useQuery({
    queryKey: ["my-connections"],
    queryFn: () => listMyConn({}),
  });
  const myCredentials = useQuery({
    queryKey: ["my-credential-metadata"],
    queryFn: () => listMyCred({}),
  });
  const projectCredentials = useQuery({
    queryKey: ["project-credentials", projectId],
    queryFn: () => listProjCred({ data: { projectId } }),
    enabled: Boolean(projectId),
  });
  const projectMemories = useQuery({
    queryKey: ["memories", projectId],
    queryFn: () => getMemories({ data: { projectId } }),
    enabled: Boolean(projectId),
  });
  const projectKnowledge = useQuery({
    queryKey: ["knowledge", projectId],
    queryFn: () => getKnowledge({ data: { projectId } }),
    enabled: Boolean(projectId),
  });

  const addConnMut = useMutation({
    mutationFn: () => addConn({ data: { projectId, connectionId: pickConnection } }),
    onSuccess: () => {
      toast.success("Connection shared with project");
      setPickConnection("");
      void qc.invalidateQueries({ queryKey: ["project-connections", projectId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const remConnMut = useMutation({
    mutationFn: (connectionId: string) => remConn({ data: { projectId, connectionId } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["project-connections", projectId] }),
  });

  const addCredMut = useMutation({
    mutationFn: () => addCred({ data: { projectId, credentialId: pickCredential } }),
    onSuccess: () => {
      toast.success("Credential shared with project");
      setPickCredential("");
      void qc.invalidateQueries({ queryKey: ["project-credentials", projectId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const remCredMut = useMutation({
    mutationFn: (credentialId: string) => remCred({ data: { projectId, credentialId } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["project-credentials", projectId] }),
  });

  const renameProjectMut = useMutation({
    mutationFn: () => renameProj({ data: { projectId, name: projectName } }),
    onSuccess: () => {
      toast.success("Project renamed");
      setRenameOpen(false);
      void qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not rename project"),
  });

  const deleteProjectMut = useMutation({
    mutationFn: () => deleteProj({ data: { projectId } }),
    onSuccess: (deleted) => {
      toast.success(`${deleted.name} deleted`);
      void qc.invalidateQueries({ queryKey: ["projects"] });
      void navigate({ to: "/projects" });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not delete project"),
  });

  const resourceGroups = groupProjectResources(resources.data ?? []);

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
            <Link to="/project-access/$projectId" params={{ projectId }}>
              Manage access
            </Link>
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
          {canManageProjectSettings ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setProjectName(project?.name ?? "");
                  setRenameOpen(true);
                }}
              >
                <Pencil className="size-3.5" /> Rename
              </Button>
              {isAdmin ? (
                <Button size="sm" variant="destructive" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="size-3.5" /> Delete project
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      <Card className="shadow-panel">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Memory · Knowledge</CardTitle>
          <CardDescription>
            Private context assigned from Studio. These records never publish to Marketplace.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-2">
          <section className="space-y-2" aria-label="Project memory">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Memory</h3>
              <Badge variant="secondary">{projectMemories.data?.length ?? 0}</Badge>
            </div>
            {(projectMemories.data ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">No memory assigned.</p>
            ) : (
              (projectMemories.data ?? []).map((item) => (
                <div key={item.id} className="rounded-lg border border-border/80 px-3 py-2">
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.content}</p>
                </div>
              ))
            )}
          </section>
          <section className="space-y-2" aria-label="Project knowledge">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Knowledge</h3>
              <Badge variant="secondary">{projectKnowledge.data?.length ?? 0}</Badge>
            </div>
            {(projectKnowledge.data ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">No knowledge assigned.</p>
            ) : (
              (projectKnowledge.data ?? []).map((item) => (
                <div key={item.id} className="rounded-lg border border-border/80 px-3 py-2">
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.content}</p>
                </div>
              ))
            )}
          </section>
        </CardContent>
      </Card>

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
        <CardHeader>
          <CardTitle className="text-base">Shared workspace library</CardTitle>
          <CardDescription>
            Install once and use across all your projects. Choose project credentials separately
            below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link to="/library">Manage installed resources</Link>
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Available resources ({resources.data?.length ?? 0})
        </h2>
        {(resources.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No resources yet. Install from Marketplace to make them available across your projects.
          </p>
        ) : (
          resourceGroups.map((group) => (
            <section key={group.type} className="space-y-2" aria-label={group.label}>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">{group.label}</h3>
                <Badge variant="secondary" className="text-[10px]">
                  {group.items.length}
                </Badge>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {group.items.map((row) => {
                  const resource = row.resources;
                  return (
                    <Card key={row.id} className="p-4 shadow-panel">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{resource?.name ?? "Resource"}</p>
                            <Badge variant="secondary" className="text-[10px] uppercase">
                              {resource?.resource_type}
                            </Badge>
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {resource?.description || resource?.version || ""}
                          </p>
                        </div>
                        <Badge variant="outline">
                          {row.shared ? "All projects" : "Project context"}
                        </Badge>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>

      <Card className="shadow-panel">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Connections · MCP · AI Gateway</CardTitle>
          <CardDescription>
            The account owner explicitly shares this connection with the project. Members can invoke its
            provider tools through the broker; credentials and connection settings stay private.
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
                {(myConnections.data ?? []).map(
                  (c: { id: string; display_name?: string; provider?: string }) => (
                    <option key={c.id} value={c.id}>
                      {c.display_name || c.provider} ({c.provider})
                    </option>
                  ),
                )}
              </select>
            </div>
            <Button
              disabled={!pickConnection || addConnMut.isPending}
              onClick={() => addConnMut.mutate()}
            >
              {addConnMut.isPending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
              Share connection
            </Button>
          </div>
          <div className="space-y-2">
            {(connections.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No connections scoped to this project yet.
              </p>
            ) : (
              (connections.data ?? []).map(
                (row: {
                  id: string;
                  connection_id?: string;
                  can_revoke?: boolean;
                  app_connections?: {
                    display_name?: string;
                    provider?: string;
                    status?: string;
                  } | null;
                }) => {
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
                      {row.can_revoke ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Remove ${c?.display_name || c?.provider || "connection"} from project`}
                          onClick={() => row.connection_id && remConnMut.mutate(row.connection_id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      ) : null}
                    </div>
                  );
                },
              )
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-panel">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Vault credential references</CardTitle>
          <CardDescription>
            These references show metadata only and do not grant access to a connected account. Secret
            values and TOTP seeds remain private to their owner.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[220px] flex-1 space-y-1">
              <Label htmlFor="pick-credential">Personal Vault credential reference</Label>
              <select
                id="pick-credential"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={pickCredential}
                onChange={(event) => setPickCredential(event.target.value)}
              >
                <option value="">Select credential…</option>
                {(myCredentials.data ?? []).map(
                  (credential: { id: string; name?: string; secret_type?: string }) => (
                    <option key={credential.id} value={credential.id}>
                      {credential.name} ({credential.secret_type})
                    </option>
                  ),
                )}
              </select>
            </div>
            <Button
              disabled={!pickCredential || addCredMut.isPending}
              onClick={() => addCredMut.mutate()}
            >
              {addCredMut.isPending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
              Share with project
            </Button>
          </div>
          <div className="space-y-2">
            {(projectCredentials.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No general credentials shared with this project.
              </p>
            ) : (
              (projectCredentials.data ?? []).map(
                (credential: {
                  id: string;
                  credential_id: string;
                  name?: string;
                  secret_type?: string;
                  scopes?: string[];
                  can_remove?: boolean;
                }) => (
                  <div
                    key={credential.id}
                    className="flex items-center justify-between rounded-lg border border-border/80 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium">{credential.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {credential.secret_type} ·{" "}
                        {(credential.scopes ?? []).join(", ") || "general"}
                      </p>
                    </div>
                    {credential.can_remove ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Remove ${credential.name ?? "credential"} from project`}
                        onClick={() => remCredMut.mutate(credential.credential_id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    ) : null}
                  </div>
                ),
              )
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={renameOpen} onOpenChange={setRenameOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rename project</AlertDialogTitle>
            <AlertDialogDescription>
              Change the display name. The stable project ID and slug remain unchanged so existing
              integrations keep working.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="project-name">Project name</Label>
            <Input
              id="project-name"
              value={projectName}
              maxLength={120}
              onChange={(event) => setProjectName(event.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={renameProjectMut.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={projectName.trim().length < 2 || renameProjectMut.isPending}
              onClick={(event) => {
                event.preventDefault();
                renameProjectMut.mutate();
              }}
            >
              {renameProjectMut.isPending ? "Saving…" : "Save name"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes “{project?.name}”, its environments, memberships, resource
              assignments, and project-scoped API keys. Installed workspace-library resources are
              not deleted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteProjectMut.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteProjectMut.isPending}
              onClick={(event) => {
                event.preventDefault();
                deleteProjectMut.mutate();
              }}
            >
              {deleteProjectMut.isPending ? "Deleting…" : "Delete project permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
