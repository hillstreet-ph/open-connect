import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Loader2, MailPlus, Plus, UsersRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  createOrganizationGroup,
  inviteOrganizationMember,
  listOrganizations,
  listOrganizationPeople,
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
      {
        name: "description",
        content: "Manage the hillstreet-ph organization, people, and access.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OrgsPage,
});

function OrgsPage() {
  const qc = useQueryClient();
  const listOrgs = useServerFn(listOrganizations);
  const listPeople = useServerFn(listOrganizationPeople);
  const createGroup = useServerFn(createOrganizationGroup);
  const inviteMember = useServerFn(inviteOrganizationMember);

  const [peopleOrgId, setPeopleOrgId] = useState("");
  const [groupName, setGroupName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [inviteGroupId, setInviteGroupId] = useState("");

  const orgs = useQuery({ queryKey: ["organizations"], queryFn: () => listOrgs({}) });
  const activeOrgId = peopleOrgId || orgs.data?.[0]?.id || "";
  const people = useQuery({
    queryKey: ["organization-people", activeOrgId],
    queryFn: () => listPeople({ data: { organizationId: activeOrgId } }),
    enabled: Boolean(activeOrgId),
  });

  const groupMutation = useMutation({
    mutationFn: () => createGroup({ data: { organizationId: activeOrgId, name: groupName } }),
    onSuccess: () => {
      toast.success("Group created");
      setGroupName("");
      void qc.invalidateQueries({ queryKey: ["organization-people", activeOrgId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create group"),
  });

  const inviteMutation = useMutation({
    mutationFn: () =>
      inviteMember({
        data: {
          organizationId: activeOrgId,
          email: inviteEmail,
          role: inviteRole,
          groupId: inviteGroupId || undefined,
        },
      }),
    onSuccess: (result) => {
      toast.success(result.invited ? "Invitation sent" : "Existing user added");
      setInviteEmail("");
      void qc.invalidateQueries({ queryKey: ["organization-people", activeOrgId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not invite member"),
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
      <Badge variant="outline" className="mb-2 border-primary/40 text-primary">
        <Building2 className="mr-1 size-3" /> Organization settings
      </Badge>
      <h1 className="text-2xl font-semibold sm:text-3xl">hillstreet-ph</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Manage people, roles, and access for the single Open-Connect organization. Workspace and
        project management stays under Workspaces.
      </p>

      <Card className="mt-8 shadow-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UsersRound className="size-4" /> People & groups
          </CardTitle>
          <CardDescription>
            Invite teammates, assign a least-privilege role, and organize access into reusable
            groups. New users receive a secure Supabase invitation email.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="people-org">Organization</Label>
            <select
              id="people-org"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={activeOrgId}
              onChange={(event) => {
                setPeopleOrgId(event.target.value);
                setInviteGroupId("");
              }}
            >
              <option value="">Select an organization…</option>
              {(orgs.data ?? []).map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </div>

          {activeOrgId ? (
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-4 rounded-lg border p-4">
                <div>
                  <h3 className="font-medium">Invite a person</h3>
                  <p className="text-xs text-muted-foreground">
                    Owners and admins can invite members. Owner access cannot be granted here.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invite-email">Email</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    autoComplete="email"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    placeholder="teammate@company.com"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="invite-role">Role</Label>
                    <select
                      id="invite-role"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={inviteRole}
                      onChange={(event) => setInviteRole(event.target.value as "admin" | "member")}
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="invite-group">Group (optional)</Label>
                    <select
                      id="invite-group"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={inviteGroupId}
                      onChange={(event) => setInviteGroupId(event.target.value)}
                    >
                      <option value="">No group</option>
                      {(people.data?.groups ?? []).map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <Button
                  disabled={!inviteEmail.trim() || inviteMutation.isPending}
                  onClick={() => inviteMutation.mutate()}
                >
                  {inviteMutation.isPending ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <MailPlus className="mr-2 size-4" />
                  )}
                  Send invitation
                </Button>
              </div>

              <div className="space-y-4 rounded-lg border p-4">
                <div>
                  <h3 className="font-medium">Groups</h3>
                  <p className="text-xs text-muted-foreground">
                    Use groups for departments, project teams, or operational functions.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Input
                    value={groupName}
                    onChange={(event) => setGroupName(event.target.value)}
                    placeholder="Engineering"
                  />
                  <Button
                    variant="outline"
                    disabled={!groupName.trim() || groupMutation.isPending}
                    onClick={() => groupMutation.mutate()}
                  >
                    {groupMutation.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                    <span className="sr-only">Create group</span>
                  </Button>
                </div>
                <div className="space-y-2">
                  {(people.data?.groups ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No groups yet.</p>
                  ) : (
                    people.data?.groups.map((group) => (
                      <div
                        key={group.id}
                        className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2"
                      >
                        <span className="text-sm font-medium">{group.name}</span>
                        <Badge variant="secondary">{group.memberCount} members</Badge>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {activeOrgId && people.isLoading ? <Loader2 className="size-5 animate-spin" /> : null}
          {activeOrgId && people.data ? (
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <h3 className="mb-2 text-sm font-medium">Members</h3>
                <div className="space-y-2">
                  {people.data.members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between rounded-md border px-3 py-2"
                    >
                      <span className="truncate text-sm">
                        {member.profile?.display_name || "Workspace member"}
                      </span>
                      <Badge variant="outline">{member.role}</Badge>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-medium">Pending invitations</h3>
                <div className="space-y-2">
                  {people.data.invitations.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No pending invitations.</p>
                  ) : (
                    people.data.invitations.map((invitation) => (
                      <div
                        key={invitation.id}
                        className="flex items-center justify-between rounded-md border px-3 py-2"
                      >
                        <span className="truncate text-sm">{invitation.email}</span>
                        <Badge variant="outline">{invitation.role}</Badge>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

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
