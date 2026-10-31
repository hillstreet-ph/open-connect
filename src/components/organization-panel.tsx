import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Loader2, MailPlus, Plus, Save, Trash2, UsersRound, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  cancelOrganizationInvitation,
  createOrganizationGroup,
  inviteOrganizationMember,
  getCanonicalOrganization,
  getOrganizationAccess,
  listOrganizationPeople,
  removeOrganizationMember,
  setOrganizationMemberGroups,
  updateOrganizationMemberRole,
} from "@/lib/orgs.functions";
import { assignRole, listRoleAssignments } from "@/lib/roles.functions";
import { ALL_ROLES, roleLabel, canonicalAppRole, type AppRole } from "@/lib/rbac";
import { useRoles } from "@/hooks/use-roles";
import { ORG_ROLES, ORG_ROLE_LABEL, type OrgRole } from "@/lib/identity";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const selectClass = "h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm";

type Invitation = { id: string; email: string; role: string };

export function OrganizationPanel() {
  const qc = useQueryClient();
  const { isAdmin: isPlatformAdmin } = useRoles();
  const getOrganization = useServerFn(getCanonicalOrganization);
  const listPeople = useServerFn(listOrganizationPeople);
  const createGroup = useServerFn(createOrganizationGroup);
  const inviteMember = useServerFn(inviteOrganizationMember);
  const updateRole = useServerFn(updateOrganizationMemberRole);
  const removeMember = useServerFn(removeOrganizationMember);
  const setGroups = useServerFn(setOrganizationMemberGroups);
  const getOrgAccess = useServerFn(getOrganizationAccess);
  const listAssignments = useServerFn(listRoleAssignments);
  const assignPlatformRole = useServerFn(assignRole);
  const cancelInvitation = useServerFn(cancelOrganizationInvitation);

  const [groupName, setGroupName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrgRole>("member");
  const [roleDrafts, setRoleDrafts] = useState<Record<string, string>>({});
  const [platformDrafts, setPlatformDrafts] = useState<Record<string, string>>({});
  const [groupDrafts, setGroupDrafts] = useState<Record<string, string>>({});
  const [inviteGroupId, setInviteGroupId] = useState("");
  const [pendingCancel, setPendingCancel] = useState<Invitation | null>(null);

  const organization = useQuery({
    queryKey: ["organization", "hillstreet-ph"],
    queryFn: () => getOrganization(),
  });
  const activeOrgId = organization.data?.id ?? "";
  const access = useQuery({
    queryKey: ["organization-access", activeOrgId],
    queryFn: () => getOrgAccess({ data: { organizationId: activeOrgId } }),
    enabled: Boolean(activeOrgId),
  });
  const isOrgAdmin = access.data?.isAdmin === true;
  const people = useQuery({
    queryKey: ["organization-people", activeOrgId],
    queryFn: () => listPeople({ data: { organizationId: activeOrgId } }),
    enabled: Boolean(activeOrgId && isOrgAdmin),
  });
  const assignments = useQuery({
    queryKey: ["role-assignments"],
    queryFn: () => listAssignments({}),
    enabled: isPlatformAdmin,
  });
  const platformByUser = new Map<string, AppRole>(
    (assignments.data ?? []).map((row: { user_id: string; role: AppRole }) => [
      row.user_id,
      canonicalAppRole(row.role),
    ]),
  );

  const refreshPeople = () =>
    qc.invalidateQueries({ queryKey: ["organization-people", activeOrgId] });

  const groupMutation = useMutation({
    mutationFn: () => createGroup({ data: { organizationId: activeOrgId, name: groupName } }),
    onSuccess: () => {
      toast.success("Group created");
      setGroupName("");
      void refreshPeople();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create group"),
  });

  const roleMutation = useMutation({
    mutationFn: (input: { userId: string; role: string }) =>
      updateRole({ data: { organizationId: activeOrgId, ...input } }),
    onSuccess: () => {
      toast.success("Organization role updated");
      void refreshPeople();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update role"),
  });

  const platformMutation = useMutation({
    mutationFn: (input: { email: string; role: AppRole }) => assignPlatformRole({ data: input }),
    onSuccess: () => {
      toast.success("Platform role updated");
      void qc.invalidateQueries({ queryKey: ["role-assignments"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update platform role"),
  });

  const groupMemberMutation = useMutation({
    mutationFn: (input: { userId: string; groupIds: string[] }) =>
      setGroups({ data: { organizationId: activeOrgId, ...input } }),
    onSuccess: () => {
      toast.success("Group membership updated");
      void refreshPeople();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update group"),
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => removeMember({ data: { organizationId: activeOrgId, userId } }),
    onSuccess: () => {
      toast.success("Organization and project access removed");
      void refreshPeople();
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
      void refreshPeople();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not invite member"),
  });

  const cancelMutation = useMutation({
    mutationFn: (invitationId: string) =>
      cancelInvitation({ data: { organizationId: activeOrgId, invitationId } }),
    onSuccess: () => {
      toast.success("Invitation cancelled");
      setPendingCancel(null);
      void refreshPeople();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not cancel invitation"),
  });

  const saving =
    roleMutation.isPending || platformMutation.isPending || groupMemberMutation.isPending;

  function saveMember(member: {
    user_id: string;
    email: string;
    role: string;
    groupIds: string[];
  }) {
    const orgRole = roleDrafts[member.user_id] ?? member.role;
    const currentPlatform = (platformByUser.get(member.user_id) ?? "user") as AppRole;
    const platformRole = (platformDrafts[member.user_id] ?? currentPlatform) as AppRole;
    const currentGroup = member.groupIds.length === 1 ? member.groupIds[0] : "";
    const groupId = groupDrafts[member.user_id] ?? currentGroup;

    if (orgRole !== member.role) roleMutation.mutate({ userId: member.user_id, role: orgRole });
    if (isPlatformAdmin && platformRole !== currentPlatform && member.email) {
      platformMutation.mutate({ email: member.email, role: platformRole });
    }
    if (groupId !== currentGroup) {
      groupMemberMutation.mutate({ userId: member.user_id, groupIds: groupId ? [groupId] : [] });
    }
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <div>
        <Badge variant="outline" className="mb-2 border-primary/40 text-primary">
          <Building2 className="mr-1 size-3" /> Organization settings
        </Badge>
        <h2 className="text-lg font-semibold sm:text-xl">
          {organization.data?.name ?? "hillstreet-ph"}
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
          Manage people, roles, and access for the single Open-Connect organization. Workspace and
          project management stays under Workspaces.
        </p>
      </div>

      {isOrgAdmin ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="shadow-panel">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <MailPlus className="size-4" /> Invite a person
              </CardTitle>
              <CardDescription className="text-xs">
                New users receive a secure Supabase invitation email.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="invite-email" className="text-xs">
                  Email
                </Label>
                <Input
                  id="invite-email"
                  type="email"
                  autoComplete="email"
                  className="h-9"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="teammate@company.com"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="invite-role" className="text-xs">
                    Role
                  </Label>
                  <select
                    id="invite-role"
                    className={selectClass}
                    value={inviteRole}
                    onChange={(event) => setInviteRole(event.target.value as OrgRole)}
                  >
                    {ORG_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ORG_ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="invite-group" className="text-xs">
                    Group (optional)
                  </Label>
                  <select
                    id="invite-group"
                    className={selectClass}
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
                size="sm"
                className="w-full sm:w-auto"
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
            </CardContent>
          </Card>

          <Card className="shadow-panel">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <UsersRound className="size-4" /> Groups
              </CardTitle>
              <CardDescription className="text-xs">
                Groups organize teams. Project access is shared separately.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  className="h-9"
                  value={groupName}
                  onChange={(event) => setGroupName(event.target.value)}
                  placeholder="Engineering"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
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
              <div className="space-y-1.5">
                {(people.data?.groups ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">No groups yet.</p>
                ) : (
                  people.data?.groups.map((group) => (
                    <div
                      key={group.id}
                      className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2.5 py-1.5"
                    >
                      <span className="truncate text-sm font-medium">{group.name}</span>
                      <Badge variant="secondary" className="shrink-0 text-[11px]">
                        {group.memberCount} members
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {isOrgAdmin ? (
        <Card className="shadow-panel">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <UsersRound className="size-4" /> Members
            </CardTitle>
            <CardDescription className="text-xs">
              Set each person's organization role, platform role, and group in one place.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {people.isLoading ? (
              <Loader2 className="size-5 animate-spin" />
            ) : people.data && people.data.members.length ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {people.data.members.map((member) => {
                  const currentPlatform = (platformByUser.get(member.user_id) ?? "user") as AppRole;
                  const platformRole = (platformDrafts[member.user_id] ??
                    currentPlatform) as AppRole;
                  const orgRole = roleDrafts[member.user_id] ?? member.role;
                  const currentGroup = member.groupIds.length === 1 ? member.groupIds[0] : "";
                  const groupId = groupDrafts[member.user_id] ?? currentGroup;
                  const dirty =
                    orgRole !== member.role ||
                    (isPlatformAdmin && platformRole !== currentPlatform) ||
                    groupId !== currentGroup;
                  return (
                    <div key={member.id} className="space-y-2.5 rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="block truncate text-sm font-medium">
                            {member.profile?.display_name || member.email || "Workspace member"}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {member.email}
                          </span>
                        </div>
                        <Badge variant="outline" className="shrink-0 capitalize text-[11px]">
                          {ORG_ROLE_LABEL[orgRole as OrgRole] ?? orgRole}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label
                            htmlFor={"member-role-" + member.user_id}
                            className="text-[11px] text-muted-foreground"
                          >
                            Organization role
                          </Label>
                          <select
                            id={"member-role-" + member.user_id}
                            className={selectClass}
                            value={orgRole}
                            onChange={(event) =>
                              setRoleDrafts((current) => ({
                                ...current,
                                [member.user_id]: event.target.value,
                              }))
                            }
                          >
                            {ORG_ROLES.map((r) => (
                              <option key={r} value={r}>
                                {ORG_ROLE_LABEL[r]}
                              </option>
                            ))}
                          </select>
                        </div>
                        {isPlatformAdmin ? (
                          <div className="space-y-1">
                            <Label
                              htmlFor={"member-platform-" + member.user_id}
                              className="text-[11px] text-muted-foreground"
                            >
                              Platform role
                            </Label>
                            <select
                              id={"member-platform-" + member.user_id}
                              className={selectClass}
                              value={platformRole}
                              onChange={(event) =>
                                setPlatformDrafts((current) => ({
                                  ...current,
                                  [member.user_id]: event.target.value,
                                }))
                              }
                            >
                              {ALL_ROLES.map((r) => (
                                <option key={r} value={r}>
                                  {roleLabel(r)}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : null}
                        <div className="col-span-2 space-y-1">
                          <Label
                            htmlFor={"member-group-" + member.user_id}
                            className="text-[11px] text-muted-foreground"
                          >
                            Group
                          </Label>
                          <select
                            id={"member-group-" + member.user_id}
                            className={selectClass}
                            value={groupId}
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
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 flex-1 sm:flex-none"
                          disabled={!dirty || saving}
                          onClick={() => saveMember(member)}
                        >
                          <Save className="mr-1 size-3.5" /> Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-destructive"
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
                          <Trash2 className="mr-1 size-3.5" /> Remove
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No members yet.</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {isOrgAdmin ? (
        <Card className="shadow-panel">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <MailPlus className="size-4" /> Pending invitations
            </CardTitle>
            <CardDescription className="text-xs">
              Cancel an invitation to revoke the pending email and its reserved role.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(people.data?.invitations ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending invitations.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {people.data?.invitations.map((invitation) => (
                  <li
                    key={invitation.id}
                    className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <span className="block truncate text-sm">{invitation.email}</span>
                      <Badge variant="outline" className="mt-0.5 capitalize text-[11px]">
                        {invitation.role}
                      </Badge>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 shrink-0 text-destructive"
                      disabled={cancelMutation.isPending}
                      onClick={() => setPendingCancel(invitation)}
                      aria-label={`Cancel invitation for ${invitation.email}`}
                      title="Cancel invitation"
                    >
                      <X className="mr-1 size-3.5" /> Cancel
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      {!access.isLoading && !isOrgAdmin ? (
        <Card className="shadow-panel">
          <CardHeader>
            <CardTitle className="text-sm">Organization settings are admin-managed</CardTitle>
            <CardDescription className="text-xs">
              Only organization Admins can invite people, change roles, manage groups, or update
              organization access. Ask an Admin if you need a change.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <AlertDialog
        open={pendingCancel !== null}
        onOpenChange={(open) => {
          if (!open) setPendingCancel(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this invitation?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingCancel?.email ?? "This invitation"} will no longer be able to join with the
              reserved role. You can invite them again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelMutation.isPending}>
              Keep invitation
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (pendingCancel) cancelMutation.mutate(pendingCancel.id);
              }}
            >
              {cancelMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Cancel invitation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
