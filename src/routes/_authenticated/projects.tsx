import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FolderKanban, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  createProject,
  getCanonicalOrganization,
  listProjects,
  listWorkspaces,
} from "@/lib/orgs.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWorkspaceContext } from "@/hooks/use-workspace-context";

export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({
    meta: [
      { title: "Projects — Open-Connect" },
      {
        name: "description",
        content:
          "Manage HillStreet projects and assign installed workspace resources without duplicates.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  if (pathname !== "/projects" && pathname.startsWith("/projects/")) return <Outlet />;

  return <ProjectsIndex />;
}

function ProjectsIndex() {
  const qc = useQueryClient();
  const getOrganization = useServerFn(getCanonicalOrganization);
  const listProj = useServerFn(listProjects);
  const createProj = useServerFn(createProject);
  const listWs = useServerFn(listWorkspaces);

  const [projectName, setProjectName] = useState("");
  const [projectDesc, setProjectDesc] = useState("");
  const { workspaceId: activeWorkspaceId } = useWorkspaceContext();

  const organization = useQuery({
    queryKey: ["organization", "hillstreet-ph"],
    queryFn: () => getOrganization(),
  });
  const projects = useQuery({
    queryKey: ["projects", organization.data?.id],
    queryFn: () => listProj({ data: { organizationId: organization.data!.id } }),
    enabled: Boolean(organization.data?.id),
  });
  const workspaces = useQuery({
    queryKey: ["workspaces", "hillstreet-ph"],
    queryFn: () => listWs({ data: { organizationId: organization.data!.id } }),
    enabled: Boolean(organization.data?.id),
  });

  const activeWorkspace = (workspaces.data ?? []).find(
    (workspace) => workspace.id === activeWorkspaceId,
  );
  const visibleProjects = (projects.data ?? []).filter(
    (project: { workspace_id?: string | null }) =>
      !activeWorkspace?.id || project.workspace_id === activeWorkspace.id,
  );

  const projectMutation = useMutation({
    mutationFn: () =>
      createProj({
        data: {
          organizationId: organization.data?.id ?? "",
          name: projectName,
          description: projectDesc || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Project created — open it to attach catalog & OAuth");
      setProjectName("");
      setProjectDesc("");
      void qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create project"),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Badge variant="outline" className="mb-2 border-primary/40 text-primary">
            hillstreet-ph · HillStreet
          </Badge>
          <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
            Projects
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            One workspace for every HillStreet project. Install resources from Marketplace into the
            workspace library, then assign them to one or more projects.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/resources">Marketplace</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/studio">Studio</Link>
          </Button>
        </div>
      </div>

      <Card className="shadow-panel">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">HillStreet workspace</CardTitle>
          <CardDescription>
            The single resource and access boundary for the hillstreet-ph organization.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant="secondary">{activeWorkspace?.name ?? "HillStreet"}</Badge>
          <span className="text-sm text-muted-foreground">
            {visibleProjects.length} projects · shared personal library
          </span>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-panel lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">New project</CardTitle>
            <CardDescription>e.g. Development · Business · Client X</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>Organization</Label>
              <Input value="hillstreet-ph" readOnly />
            </div>
            <div className="space-y-2">
              <Label>Workspace</Label>
              <Input value={activeWorkspace?.name ?? "HillStreet"} readOnly />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proj-name">Project name</Label>
              <Input
                id="proj-name"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Development"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proj-desc">Description (optional)</Label>
              <Input
                id="proj-desc"
                value={projectDesc}
                onChange={(e) => setProjectDesc(e.target.value)}
                placeholder="Dev agents, sandbox OAuth, test vault"
              />
            </div>
            <Button
              disabled={
                !organization.data?.id ||
                !activeWorkspace?.id ||
                !projectName.trim() ||
                projectMutation.isPending
              }
              onClick={() => projectMutation.mutate()}
            >
              {projectMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FolderKanban className="size-4" />
              )}
              Create project
            </Button>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {activeWorkspace?.name ?? "Workspace"} projects ({visibleProjects.length})
        </h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {visibleProjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No projects yet in this workspace.</p>
          ) : (
            visibleProjects.map((p) => (
              <Card key={p.id} className="p-4 shadow-panel">
                <p className="font-medium">{p.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {(p as { organizations?: { name?: string } }).organizations?.name ?? "Org"} ·{" "}
                  <span className="font-mono">{p.slug}</span>
                </p>
                {p.description ? (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button asChild size="sm">
                    <Link to="/projects/$projectId" params={{ projectId: p.id }}>
                      Open project
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/resources">Marketplace</Link>
                  </Button>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
