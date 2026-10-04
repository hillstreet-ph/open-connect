import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Loader2, MailPlus, Plus, Save, Trash2, UsersRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  createOrganizationGroup,
  deleteOrganizationGroup,
  getCanonicalOrganization,
  inviteOrganizationMember,
  listOrganizationPeople,
  removeOrganizationMember,
  renameOrganizationGroup,
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
      { name: "description", content: "Manage HillStreet people, groups, and project access." },
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
  const renameGroup = useServerFn(renameOrganizationGroup);
  const deleteGroup = useServerFn(deleteOrganizationGroup);

  const [groupName, setGroupName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "developer" | "member">("member");
  const [inviteGroupId, setInviteGroupId] = useState("");
  const [roleDrafts, setRoleDrafts] = useState<Record<string, string>>({});
  const [groupDrafts, setGroupDrafts] = useState<Record<string, string[]>>({});
  const [groupNameDrafts, setGroupNameDrafts] = useState<Record<string, string>>({});

  const organization = useQuery({
    queryKey: ["organization", "hillstreet-ph"],
    queryFn: () => getOrganization(),
  });
  const activeOrgId = organization.data?.id ?? "";
  const people = useQuery({
    queryKey: ["organization-people", activeOrgId],
    queryFn: () => listPeople({ data: { organizationId: activeOrgId } }),
    enabled: Boolean(activeOrgId),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["organization-people", activeOrgId] });

  const groupMutation = useMutation({
    mutationFn: () => createGroup({ data: { organizationId: activeOrgId, name: groupName } }),
    onSuccess: () => { toast.success("Group created"); setGroupName(""); void refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create group"),
  });
  const inviteMutation = useMutation({
    mutationFn: () => inviteMember({
      data: { organizationId: activeOrgId, email: inviteEmail, role: inviteRole, groupId: inviteGroupId || undefined },
    }),
    onSuccess: (result) => { toast.success(result.invited ? "Invitation sent" : "Existing user added"); setInviteEmail(""); void refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not invite member"),
  });
  const roleMutation = useMutation({
    mutationFn: (input: { userId: string; role: string }) =>
      updateRole({ data: { organizationId: activeOrgId, ...input } }),
    onSuccess: () => { toast.success("Organization role updated"); void refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update role"),
  });
  const removeMutation = useMutation({
    mutationFn: (userId: string) => removeMember({ data: { organizationId: activeOrgId, userId } }),
    onSuccess: () => { toast.success("Member and project access removed"); void refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not remove member"),
  });
  const groupsMutation = useMutation({
    mutationFn: (input: { userId: string; groupIds: string[] }) =>
      setGroups({ data: { organizationId: activeOrgId, ...input } }),
    onSuccess: () => { toast.success("Group membership updated"); void refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update groups"),
  });
  const renameMutation = useMutation({
    mutationFn: (input: { groupId: string; name: string }) =>
      renameGroup({ data: { organizationId: activeOrgId, ...input } }),
    onSuccess: () => { toast.success("Group renamed"); void refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not rename group"),
  });
  const deleteGroupMutation = useMutation({
    mutationFn: (groupId: string) => deleteGroup({ data: { organizationId: activeOrgId, groupId } }),
    onSuccess: () => { toast.success("Group deleted. Project access was not changed."); void refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not delete group"),
  });

  const toggleGroup = (userId: string, groupId: string, initial: string[]) => {
    const selected = groupDrafts[userId] ?? initial;
    const next = selected.includes(groupId) ? selected.filter((id) => id !== groupId) : [...selected, groupId];
    setGroupDrafts((current) => ({ ...current, [userId]: next }));
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
      <Badge variant="outline" className="mb-2 border-primary/40 text-primary">
        <Building2 className="mr-1 size-3" /> Organization settings
      </Badge>
      <h1 className="text-2xl font-semibold sm:text-3xl">{organization.data?.name ?? "HillStreet"}</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Manage HillStreet people and access. Project access is shared separately for each project;
        group membership organizes teams and does not grant project access by itself.
      </p>

      <Card className="mt-8 shadow-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><UsersRound className="size-4" /> People & groups</CardTitle>
          <CardDescription>
            Invite teammates with the least access they need. Admins can change roles, manage groups,
            and remove organization access. Removing a person also removes their project grants.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {activeOrgId ? (
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-4 rounded-lg border p-4">
                <div>
                  <h3 className="font-medium">Invite a person</h3>
                  <p className="text-xs text-muted-foreground">Organization admins can invite a member, developer, or admin.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invite-email">Email</Label>
                  <Input id="invite-email" type="email" autoComplete="email" value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)} placeholder="teammate@company.com" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="invite-role">Role</Label>
                    <select id="invite-role" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={inviteRole} onChange={(event) => setInviteRole(event.target.value as "admin" | "developer" | "member")}>
                      <option value="member">Member</option><option value="developer">Developer</option><option value="admin">Admin</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="invite-group">Group (optional)</Label>
                    <select id="invite-group" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={inviteGroupId} onChange={(event) => setInviteGroupId(event.target.value)}>
                      <option value="">No group</option>
                      {(people.data?.groups ?? []).map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                    </select>
                  </div>
                </div>
                <Button disabled={!inviteEmail.trim() || inviteMutation.isPending} onClick={() => inviteMutation.mutate()}>
                  {inviteMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <MailPlus className="mr-2 size-4" />}
                  Send invitation
                </Button>
              </div>

              <div className="space-y-4 rounded-lg border p-4">
                <div>
                  <h3 className="font-medium">Groups</h3>
                  <p className="text-xs text-muted-foreground">
                    Create and rename teams. Assign members below; groups label teams and do not automatically share projects or resources.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Input value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="Operations" aria-label="New group name" />
                  <Button variant="outline" disabled={!groupName.trim() || groupMutation.isPending} onClick={() => groupMutation.mutate()}>
                    {groupMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                    <span className="sr-only">Create group</span>
                  </Button>
                </div>
                <div className="space-y-2">
                  {(people.data?.groups ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No groups yet.</p> :
                    people.data?.groups.map((group) => (
                      <div key={group.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
                        <Input aria-label={"Name for " + group.name} className="min-w-36 flex-1"
                          value={groupNameDrafts[group.id] ?? group.name}
                          onChange={(event) => setGroupNameDrafts((current) => ({ ...current, [group.id]: event.target.value }))} />
                        <Badge variant="secondary">{group.memberCount} members</Badge>
                        <Button variant="outline" size="sm" disabled={renameMutation.isPending || !(groupNameDrafts[group.id] ?? group.name).trim()}
                          onClick={() => renameMutation.mutate({ groupId: group.id, name: groupNameDrafts[group.id] ?? group.name })}>
                          <Save className="mr-1 size-3" /> Save
                        </Button>
                        <Button variant="ghost" size="sm" aria-label={"Delete " + group.name} disabled={deleteGroupMutation.isPending}
                          onClick={() => { if (window.confirm("Delete the " + group.name + " group? This will not remove organization members or change project access.")) deleteGroupMutation.mutate(group.id); }}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          ) : null}

          {activeOrgId && people.isLoading ? <Loader2 className="size-5 animate-spin" /> : null}
          {people.isError ? (
            <div role="alert" className="rounded-md border border-destructive/30 p-3 text-sm">
              Organization people could not be loaded. Admin access is required.
            </div>
          ) : null}
          {activeOrgId && people.data ? (
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Organization members</h3>
              {people.data.members.length === 0 ? <p className="text-sm text-muted-foreground">No members have access yet.</p> :
                people.data.members.map((member) => {
                  const selectedRole = roleDrafts[member.user_id] ?? member.role;
                  const selectedGroups = groupDrafts[member.user_id] ?? member.groupIds;
                  return (
                    <div key={member.id} className="grid gap-4 rounded-lg border p-4 lg:grid-cols-[minmax(0,1fr)_14rem_minmax(12rem,1fr)_auto]">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{member.profile?.display_name || member.email || "Organization member"}</p>
                        <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                        <Badge variant="outline" className="mt-2 capitalize">{member.role}</Badge>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={"role-" + member.user_id}>Organization role</Label>
                        <select id={"role-" + member.user_id} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                          value={selectedRole} onChange={(event) => setRoleDrafts((current) => ({ ...current, [member.user_id]: event.target.value }))}>
                          <option value="member">Member</option><option value="developer">Developer</option><option value="admin">Admin</option>
                        </select>
                        <Button size="sm" variant="outline" disabled={roleMutation.isPending || selectedRole === member.role}
                          onClick={() => roleMutation.mutate({ userId: member.user_id, role: selectedRole })}>
                          <Save className="mr-1 size-3" /> Save role
                        </Button>
                      </div>
                      <fieldset className="space-y-2">
                        <legend className="text-sm font-medium">Groups</legend>
                        {people.data.groups.length === 0 ? <p className="text-xs text-muted-foreground">Create a group to organize members.</p> :
                          <div className="flex flex-wrap gap-x-4 gap-y-2">
                            {people.data.groups.map((group) => (
                              <label key={group.id} className="flex items-center gap-2 text-xs">
                                <input type="checkbox" checked={selectedGroups.includes(group.id)}
                                  onChange={() => toggleGroup(member.user_id, group.id, member.groupIds)} />
                                {group.name}
                              </label>
                            ))}
                          </div>
                        }
                        <Button size="sm" variant="outline" disabled={groupsMutation.isPending ||
                          JSON.stringify(selectedGroups.slice().sort()) === JSON.stringify(member.groupIds.slice().sort())}
                          onClick={() => groupsMutation.mutate({ userId: member.user_id, groupIds: selectedGroups })}>
                          <Save className="mr-1 size-3" /> Save groups
                        </Button>
                      </fieldset>
                      <Button size="sm" variant="ghost" className="text-destructive" disabled={removeMutation.isPending}
                        onClick={() => { if (window.confirm("Remove " + (member.email || "this member") + " from HillStreet? Their grants to all HillStreet projects will also be removed.")) removeMutation.mutate(member.user_id); }}>
                        <Trash2 className="mr-1 size-4" /> Remove
                      </Button>
                    </div>
                  );
                })}
            </div>
          ) : null}
          {activeOrgId && people.data ? (
            <div>
              <h3 className="mb-2 text-sm font-medium">Pending invitations</h3>
              {people.data.invitations.length === 0 ? <p className="text-sm text-muted-foreground">No pending invitations.</p> :
                <div className="space-y-2">{people.data.invitations.map((invitation) => (
                  <div key={invitation.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                    <span className="truncate text-sm">{invitation.email}</span>
                    <Badge variant="outline" className="capitalize">{invitation.role}</Badge>
                  </div>
                ))}</div>}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
