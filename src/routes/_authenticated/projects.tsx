import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FolderKanban, Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { createOrganization, createProject, listOrganizations, listProjects } from "@/lib/orgs.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({
    meta: [
      { title: "Projects — Open-Connect" },
      {
        name: "description",
        content:
          "Create organizations and projects — isolate agents, skills, plugins, OAuth, and vaults per workspace.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const qc = useQueryClient();
  const listOrgs = useServerFn(listOrganizations);
  const listProj = useServerFn(listProjects);
  const createOrg = useServerFn(createOrganization);
  const createProj = useServerFn(createProject);

  const [orgName, setOrgName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectDesc, setProjectDesc] = useState("");
  const [orgId, setOrgId] = useState("");

  const orgs = useQuery({ queryKey: ["organizations"], queryFn: () => listOrgs({}) });
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => listProj({}) });

  const orgMutation = useMutation({
    mutationFn: () => createOrg({ data: { name: orgName } }),
    onSuccess: (org) => {
      toast.success("Organization created");
      setOrgName("");
      if (org?.id) setOrgId(org.id);
      void qc.invalidateQueries({ queryKey: ["organizations"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create org"),
  });

  const projectMutation = useMutation({
    mutationFn: () =>
      createProj({
        data: {
          organizationId: orgId,
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
            Operations · Projects
          </Badge>
          <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
            Organizations & projects
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Separate workspaces (e.g. Development, Business). Each project gets its own agents,
            skills, plugins, prompts, OAuth/MCP accounts, and vault credentials.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/orgs">Organizations</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/resources">Marketplace</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/studio">Studio</Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="shadow-panel">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">New organization</CardTitle>
            <CardDescription>Top-level workspace — you become owner.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="org-name">Name</Label>
              <Input
                id="org-name"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="HillStreet AI"
              />
            </div>
            <Button
              disabled={!orgName.trim() || orgMutation.isPending}
              onClick={() => orgMutation.mutate()}
            >
              {orgMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Create organization
            </Button>
          </CardContent>
        </Card>

        <Card className="shadow-panel">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">New project</CardTitle>
            <CardDescription>e.g. Development · Business · Client X</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="proj-org">Organization</Label>
              <select
                id="proj-org"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={orgId}
                onChange={(e) => setOrgId(e.target.value)}
              >
                <option value="">Select…</option>
                {(orgs.data ?? []).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
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
              disabled={!orgId || !projectName.trim() || projectMutation.isPending}
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
          Your projects ({projects.data?.length ?? 0})
        </h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(projects.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No projects yet — create an org, then a project.</p>
          ) : (
            projects.data?.map((p) => (
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
                      Open workspace
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/resources">Add catalog</Link>
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
