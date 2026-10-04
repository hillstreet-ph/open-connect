import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PROJECT_ROLES = ["manager", "developer", "viewer"] as const;
type ProjectRole = (typeof PROJECT_ROLES)[number];

async function requireProjectManager(supabase: SupabaseClient, userId: string, projectId: string) {
  if (!projectId) throw new Error("projectId required");

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, name, organization_id")
    .eq("id", projectId)
    .single();
  if (projectError || !project) throw new Error("Project not found or access denied");

  const [{ data: membership }, { data: organization }] = await Promise.all([
    supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", project.organization_id)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("organizations")
      .select("owner_id")
      .eq("id", project.organization_id)
      .maybeSingle(),
  ]);

  const isOrgManager =
    ["owner", "admin"].includes((membership as { role?: string } | null)?.role ?? "") ||
    (organization as { owner_id?: string } | null)?.owner_id === userId;
  if (isOrgManager) return project;

  const { data: projectMembership } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if ((projectMembership as { role?: string } | null)?.role !== "manager") {
    throw new Error("Project manager or organization admin required");
  }
  return project;
}

async function getCandidateEmails(userIds: string[]) {
  const entries = await Promise.all(
    userIds.map(async (userId) => {
      const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
      return [userId, data.user?.email ?? ""] as const;
    }),
  );
  return new Map(entries);
}

export const listProjectAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { projectId: string }) => ({ projectId: input.projectId }))
  .handler(async ({ data, context }) => {
    const project = await requireProjectManager(context.supabase, context.userId, data.projectId);
    const [{ data: members, error: membersError }, { data: assigned, error: assignedError }] =
      await Promise.all([
        context.supabase
          .from("organization_members")
          .select("user_id, role")
          .eq("organization_id", project.organization_id)
          .order("created_at", { ascending: true }),
        context.supabase
          .from("project_members")
          .select("user_id, role")
          .eq("project_id", project.id),
      ]);
    if (membersError) throw new Error(membersError.message);
    if (assignedError) throw new Error(assignedError.message);

    const ids = (members ?? []).map((row: { user_id: string }) => row.user_id);
    const [profilesResult, emails] = await Promise.all([
      ids.length
        ? context.supabase.from("profiles").select("id, display_name, avatar_url").in("id", ids)
        : Promise.resolve({ data: [], error: null }),
      getCandidateEmails(ids),
    ]);
    if (profilesResult.error) throw new Error(profilesResult.error.message);
    const profiles = new Map(
      (profilesResult.data ?? []).map((row: { id: string; display_name: string | null; avatar_url: string | null }) => [
        row.id,
        row,
      ] as const),
    );
    const roles = new Map(
      (assigned ?? []).map((row: { user_id: string; role: ProjectRole }) => [row.user_id, row.role] as const),
    );
    return {
      project,
      members: (members ?? []).map((member: { user_id: string; role: string }) => ({
        userId: member.user_id,
        organizationRole: member.role,
        email: emails.get(member.user_id) ?? "",
        profile: profiles.get(member.user_id) ?? null,
        projectRole: roles.get(member.user_id) ?? null,
      })),
      projectRoles: PROJECT_ROLES,
    };
  });

export const setProjectMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { projectId: string; userId: string; role: string }) => ({
    projectId: input.projectId,
    userId: input.userId,
    role: input.role as ProjectRole,
  }))
  .handler(async ({ data, context }) => {
    if (!data.userId) throw new Error("Choose an organization member");
    if (!PROJECT_ROLES.includes(data.role)) throw new Error("Choose Manager, Developer, or Viewer");
    const project = await requireProjectManager(context.supabase, context.userId, data.projectId);
    const { data: member, error: memberError } = await context.supabase
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", project.organization_id)
      .eq("user_id", data.userId)
      .maybeSingle();
    if (memberError) throw new Error(memberError.message);
    if (!member) throw new Error("Project collaborators must be active organization members");

    const { error } = await context.supabase.from("project_members").upsert(
      { project_id: project.id, user_id: data.userId, role: data.role },
      { onConflict: "project_id,user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true, projectId: project.id, userId: data.userId, role: data.role };
  });

export const removeProjectMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { projectId: string; userId: string }) => ({
    projectId: input.projectId,
    userId: input.userId,
  }))
  .handler(async ({ data, context }) => {
    if (!data.userId) throw new Error("userId required");
    const project = await requireProjectManager(context.supabase, context.userId, data.projectId);
    const { error } = await context.supabase
      .from("project_members")
      .delete()
      .eq("project_id", project.id)
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true, projectId: project.id, userId: data.userId };
  });
