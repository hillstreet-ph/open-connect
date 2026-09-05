import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, FolderKanban, Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  createOrganization,
  createProject,
  listOrganizations,
  listProjects,
} from "@/lib/orgs.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/orgs")({
  head: () => ({
    meta: [
      { title: "Organizations — Open-Connect" },
      { name: "description", content: "Create organizations and projects for your AI workspace." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrgsPage,
});

function OrgsPage() {
  const qc = useQueryClient();
  const listOrgs = useServerFn(listOrganizations);
  const listProj = useServerFn(listProjects);
  const createOrg = useServerFn(createOrganization);
  const createProj = useServerFn(createProject);

  const [orgName, setOrgName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [orgId, setOrgId] = useState("");

  const orgs = useQuery({ queryKey: ["organizations"], queryFn: () => listOrgs({}) });
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => listProj({}) });

  const orgMutation = useMutation({
    mutationFn: () => createOrg({ data: { name: orgName } }),
    onSuccess: () => {
      toast.success("Organization created");
      setOrgName("");
      void qc.invalidateQueries({ queryKey: ["organizations"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create org"),
  });

  const projectMutation = useMutation({
    mutationFn: () => createProj({ data: { organizationId: orgId, name: projectName } }),
    onSuccess: () => {
      toast.success("Project created");
      setProjectName("");
      void qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create project"),
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
      <Badge variant="outline" className="mb-2 border-primary/40 text-primary">
        <Building2 className="mr-1 size-3" /> Workspace · Organizations
      </Badge>
      <h1 className="text-2xl font-semibold sm:text-3xl">Organizations & projects</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Group agents, keys, and packages by organization. Projects scope workstreams inside an org.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card className="shadow-panel">
          <CardHeader>
            <CardTitle className="text-base">New organization</CardTitle>
            <CardDescription>You become the owner.</CardDescription>
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
              {orgMutation.isPending ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Plus className="mr-1 size-4" />}
              Create organization
            </Button>
          </CardContent>
        </Card>

        <Card className="shadow-panel">
          <CardHeader>
            <CardTitle className="text-base">New project</CardTitle>
            <CardDescription>Belongs to one organization.</CardDescription>
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
                placeholder="Release manager"
              />
            </div>
            <Button
              disabled={!orgId || !projectName.trim() || projectMutation.isPending}
              onClick={() => projectMutation.mutate()}
            >
              {projectMutation.isPending ? (
                <Loader2 className="mr-1 size-4 animate-spin" />
              ) : (
                <FolderKanban className="mr-1 size-4" />
              )}
              Create project
            </Button>
          </CardContent>
        </Card>
      </div>

      <h2 className="mt-10 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Your organizations
      </h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {(orgs.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No organizations yet.</p>
        ) : (
          orgs.data?.map((o) => (
            <Card key={o.id} className="p-4">
              <p className="font-medium">{o.name}</p>
              <p className="font-mono text-xs text-muted-foreground">{o.slug}</p>
            </Card>
          ))
        )}
      </div>

      <h2 className="mt-10 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Your projects
      </h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {(projects.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No projects yet.</p>
        ) : (
          projects.data?.map((p) => (
            <Card key={p.id} className="p-4">
              <p className="font-medium">{p.name}</p>
              <p className="text-xs text-muted-foreground">
                {(p as { organizations?: { name?: string } }).organizations?.name ?? "Org"} ·{" "}
                <span className="font-mono">{p.slug}</span>
              </p>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
