import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  listProjectAccess,
  setProjectMemberRole,
  removeProjectMember,
} from "@/lib/project-access.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/project-access/$projectId")({
  head: () => ({
    meta: [
      { title: "Project access — Open-Connect" },
      {
        name: "description",
        content: "Assign organization members to project-specific roles.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProjectAccessPage,
});

function ProjectAccessPage() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();
  const listAccess = useServerFn(listProjectAccess);
  const setRole = useServerFn(setProjectMemberRole);
  const removeMember = useServerFn(removeProjectMember);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const access = useQuery({
    queryKey: ["project-access", projectId],
    queryFn: () => listAccess({ data: { projectId } }),
  });

  const saveRole = useMutation({
    mutationFn: (input: { userId: string; role: string }) =>
      setRole({ data: { projectId, userId: input.userId, role: input.role } }),
    onSuccess: () => {
      toast.success("Project access updated");
      void queryClient.invalidateQueries({ queryKey: ["project-access", projectId] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not update access"),
  });

  const revoke = useMutation({
    mutationFn: (userId: string) => removeMember({ data: { projectId, userId } }),
    onSuccess: () => {
      toast.success("Project access removed");
      void queryClient.invalidateQueries({ queryKey: ["project-access", projectId] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not remove access"),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Badge variant="outline" className="mb-2 border-primary/40 text-primary">
            HillStreet · Project access
          </Badge>
          <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
            {access.data?.project.name ?? "Project collaborators"}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Organization roles control organization settings. Project roles control access to this
            project only. A person can have different roles across projects.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/projects/$projectId" params={{ projectId }}>
            Back to project
          </Link>
        </Button>
      </div>

      <Card className="shadow-panel">
        <CardHeader>
          <CardTitle className="text-base">Project collaborators</CardTitle>
          <CardDescription>
            Assign only active HillStreet organization members. Member can use resources explicitly
            shared with the project. Developer can build project resources and tools. Admin can
            manage project access, installs, and environments.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {access.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading organization members…</p>
          ) : access.isError ? (
            <div
              role="alert"
              className="space-y-2 rounded-md border border-destructive/30 p-3 text-sm"
            >
              <p>Could not load project access.</p>
              <p className="text-muted-foreground">
                {access.error instanceof Error
                  ? access.error.message
                  : "Check your project access and try again."}
              </p>
              <Button
                variant="outline"
                size="sm"
                disabled={access.isFetching}
                onClick={() => void access.refetch()}
              >
                Retry
              </Button>
            </div>
          ) : (access.data?.members.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No active organization members.</p>
          ) : (
            access.data?.members.map((member) => {
              const selected = drafts[member.userId] ?? member.projectRole ?? "";
              const original = member.projectRole ?? "";
              return (
                <div
                  key={member.userId}
                  className="grid gap-3 rounded-lg border border-border/70 p-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {member.profile?.display_name || member.email || "Organization member"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {member.email || member.userId}
                    </p>
                    <Badge variant="outline" className="mt-1 text-[10px] capitalize">
                      Organization {member.organizationRole}
                    </Badge>
                  </div>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    aria-label={`Project role for ${member.email || member.userId}`}
                    value={selected}
                    onChange={(event) =>
                      setDrafts((current) => ({ ...current, [member.userId]: event.target.value }))
                    }
                  >
                    <option value="">No project access</option>
                    <option value="member">Member</option>
                    <option value="developer">Developer</option>
                    <option value="admin">Admin</option>
                  </select>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={!selected || selected === original || saveRole.isPending}
                      onClick={() =>
                        selected
                          ? saveRole.mutate({ userId: member.userId, role: selected })
                          : undefined
                      }
                    >
                      Save role
                    </Button>
                    {original ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={revoke.isPending}
                        onClick={() => revoke.mutate(member.userId)}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
