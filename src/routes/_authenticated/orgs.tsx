import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Loader2, MailPlus, Plus, Save, Trash2, UsersRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  createOrganizationGroup,
  inviteOrganizationMember,
  getCanonicalOrganization,
  getOrganizationAccess,
  listOrganizationPeople,
  removeOrganizationMember,
  setOrganizationMemberGroups,
  updateOrganizationMemberRole,
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
  const getOrganization = useServerFn(getCanonicalOrganization);
  const listPeople = useServerFn(listOrganizationPeople);
  const createGroup = useServerFn(createOrganizationGroup);
  const inviteMember = useServerFn(inviteOrganizationMember);
  const updateRole = useServerFn(updateOrganizationMemberRole);
  const removeMember = useServerFn(removeOrganizationMember);
  const setGroups = useServerFn(setOrganizationMemberGroups);
  const getOrgAccess = useServerFn(getOrganizationAccess);

  const [groupName, setGroupName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "developer" | "member">("member");
  const [roleDrafts, setRoleDrafts] = useState<Record<string, string>>({});
  const [groupDrafts, setGroupDrafts] = useState<Record<string, string>>({});
  const [inviteGroupId, setInviteGroupId] = useState("");

  const organization = useQuery({
    queryKey: ["organization", "hillstreet-ph"],
    queryFn: () => getOrganization(),
  });
  const activeOrgId = organization.data?.id ?? "";
  const access = useQuery({
    queryKey: ["organization-access", activeOrgId],
    queryFn: () => getOrgAccess({ data: { organizationId: activeOrgId } }),
    enabled: Boolean(activeOrgId && isAdmin),
  });
  const isAdmin = access.data?.isAdmin === true;
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

  const roleMutation = useMutation({
    mutationFn: (input: { userId: string; role: string }) =>
      updateRole({ data: { organizationId: activeOrgId, ...input } }),
    onSuccess: () => {
      toast.success("Organization role updated");
      void qc.invalidateQueries({ queryKey: ["organization-people", activeOrgId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update role"),
  });

  const groupMemberMutation = useMutation({
    mutationFn: (input: { userId: string; groupIds: string[] }) =>
      setGroups({ data: { organizationId: activeOrgId, ...input } }),
    onSuccess: () => {
      toast.success("Group membership updated");
      void qc.invalidateQueries({ queryKey: ["organization-people", activeOrgId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update group"),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => removeMember({ data: { organizationId: activeOrgId, userId } }),
    onSuccess: () => {
      toast.success("Organization and project access removed");
      void qc.invalidateQueries({ queryKey: ["organization-people", activeOrgId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not remove member"),
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
      <h1 className="text-2xl font-semibold sm:text-3xl">
        {organization.data?.name ?? "hillstreet-ph"}
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Manage people, roles, and access for the single Open-Connect organization. Workspace and
        project management stays under Workspaces.
      </p>

      {access.isLoading ? (
        <Card className="mt-8 shadow-panel">
          <CardContent className="py-6 text-sm text-muted-foreground">
            Checking organization permissions…
          </CardContent>
        </Card>
      ) : isAdmin ? (
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
            {activeOrgId ? (
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-4 rounded-lg border p-4">
                  <div>
                    <h3 className="font-medium">Invite a person</h3>
                    <p className="text-xs text-muted-foreground">
                      Organization admins can invite members, developers, and admins.
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
                        onChange={(event) =>
                          setInviteRole(event.target.value as "admin" | "developer" | "member")
                        }
                      >
                        <option value="member">Member</option>
                        <option value="developer">Developer</option>
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
                      Use groups to organize teams. Project access is shared separately; group
                      membership does not grant it.
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
                      <div key={member.id} className="space-y-3 rounded-md border p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <span className="block truncate text-sm font-medium">
                              {member.profile?.display_name || member.email || "Workspace member"}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {member.email}
                            </span>
                          </div>
                          <Badge variant="outline" className="capitalize">
                            {member.role}
                          </Badge>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor={"member-role-" + member.user_id}>Organization role</Label>
                            <select
                              id={"member-role-" + member.user_id}
                              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                              value={roleDrafts[member.user_id] ?? member.role}
                              onChange={(event) =>
                                setRoleDrafts((current) => ({
                                  ...current,
                                  [member.user_id]: event.target.value,
                                }))
                              }
                            >
                              <option value="member">Member</option>
                              <option value="developer">Developer</option>
                              <option value="admin">Admin</option>
                            </select>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={
                                roleMutation.isPending ||
                                (roleDrafts[member.user_id] ?? member.role) === member.role
                              }
                              onClick={() =>
                                roleMutation.mutate({
                                  userId: member.user_id,
                                  role: roleDrafts[member.user_id] ?? member.role,
                                })
                              }
                            >
                              <Save className="mr-1 size-3" /> Save role
                            </Button>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor={"member-group-" + member.user_id}>Group</Label>
                            <select
                              id={"member-group-" + member.user_id}
                              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                              value={
                                groupDrafts[member.user_id] ??
                                (member.groupIds.length === 1 ? member.groupIds[0] : "")
                              }
                              onChange={(event) =>
                                setGroupDrafts((current) => ({
                                  ...current,
                                  [member.user_id]: event.target.value,
                                }))
                              }
                            >
                              <option value="">No group</option>
                              {(people.data?.groups ?? []).map((group) => (
                                <option key={group.id} value={group.id}>
                                  {group.name}
                                </option>
                              ))}
                            </select>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={
                                groupMemberMutation.isPending ||
                                (groupDrafts[member.user_id] ??
                                  (member.groupIds.length === 1 ? member.groupIds[0] : "")) ===
                                  (member.groupIds.length === 1 ? member.groupIds[0] : "")
                              }
                              onClick={() => {
                                const groupId =
                                  groupDrafts[member.user_id] ??
                                  (member.groupIds.length === 1 ? member.groupIds[0] : "");
                                groupMemberMutation.mutate({
                                  userId: member.user_id,
                                  groupIds: groupId ? [groupId] : [],
                                });
                              }}
                            >
                              <Save className="mr-1 size-3" /> Move group
                            </Button>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          disabled={removeMutation.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                "Remove " +
                                  (member.email || "this member") +
                                  " and their HillStreet project grants?",
                              )
                            ) {
                              removeMutation.mutate(member.user_id);
                            }
                          }}
                        >
                          <Trash2 className="mr-1 size-4" /> Remove
                        </Button>
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
      ) : (
        <Card className="mt-8 shadow-panel">
          <CardHeader>
            <CardTitle className="text-base">Organization settings are admin-managed</CardTitle>
            <CardDescription>
              Only organization Admins can invite people, change roles, manage groups, or update
              organization access. Ask an Admin if you need a change.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
