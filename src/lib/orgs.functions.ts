import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function slugify(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

const DEFAULT_ENVIRONMENTS = [
  { name: "Development", slug: "development", is_default: true },
  { name: "Staging", slug: "staging", is_default: false },
  { name: "Production", slug: "production", is_default: false },
] as const;

export const listOrganizations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("organizations")
      .select("id, name, slug, owner_id, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** The product intentionally operates inside one canonical organization. */
export const getCanonicalOrganization = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("organizations")
      .select("id, name, slug, owner_id, created_at")
      .eq("slug", "hillstreet-ph")
      .single();
    if (error) throw new Error(error.message);
    return data;
  });

export const createOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { name: string }) => ({
    name: (input?.name ?? "").trim(),
  }))
  .handler(async ({ data }) => {
    if (!data.name) throw new Error("Organization name required");
    throw new Error(
      "Open-Connect uses the hillstreet-ph organization. Create a workspace instead.",
    );
  });

async function requireOrganizationManager(
  supabase: Parameters<Parameters<typeof createServerFn>[0]>[0] extends never ? never : unknown,
  organizationId: string,
  userId: string,
) {
  const client = supabase as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (
          column: string,
          value: string,
        ) => {
          eq: (column: string, value: string) => { maybeSingle: () => Promise<{ data: unknown }> };
        };
      };
    };
  };
  const { data } = await client
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  const role = (data as { role?: string } | null)?.role;
  if (role !== "admin") {
    throw new Error("Organization admin access is required to manage people");
  }
}

export const listOrganizationPeople = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string }) => ({ organizationId: input.organizationId }))
  .handler(async ({ data, context }) => {
    if (!data.organizationId) throw new Error("organizationId required");
    await requireOrganizationManager(context.supabase, data.organizationId, context.userId);
    const [members, groups, groupMembers, invitations] = await Promise.all([
      context.supabase
        .from("organization_members")
        .select("id, user_id, role, created_at")
        .eq("organization_id", data.organizationId)
        .order("created_at", { ascending: true }),
      context.supabase
        .from("organization_groups")
        .select("id, name, description, created_at")
        .eq("organization_id", data.organizationId)
        .order("name"),
      context.supabase
        .from("organization_group_members")
        .select("group_id, user_id")
        .eq("organization_id", data.organizationId),
      context.supabase
        .from("organization_invitations")
        .select("id, email, role, status, expires_at, created_at")
        .eq("organization_id", data.organizationId)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
    ]);
    for (const result of [members, groups, groupMembers, invitations]) {
      if (result.error) throw new Error(result.error.message);
    }
    const memberIds = (members.data ?? []).map((member) => member.user_id);
    const memberEmails = await Promise.all(
      memberIds.map(async (userId) => {
        const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
        return [userId, data.user?.email ?? ""] as const;
      }),
    );
    const emailsById = new Map(memberEmails);
    const profiles = memberIds.length
      ? await context.supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", memberIds)
      : { data: [], error: null };
    if (profiles.error) throw new Error(profiles.error.message);
    const profilesById = new Map((profiles.data ?? []).map((profile) => [profile.id, profile]));
    return {
      members: (members.data ?? []).map((member) => ({
        ...member,
        profile: profilesById.get(member.user_id) ?? null,
        email: emailsById.get(member.user_id) ?? "",
        groupIds: (groupMembers.data ?? [])
          .filter((item) => item.user_id === member.user_id)
          .map((item) => item.group_id),
      })),
      groups: (groups.data ?? []).map((group) => ({
        ...group,
        memberCount: (groupMembers.data ?? []).filter((item) => item.group_id === group.id).length,
      })),
      invitations: invitations.data ?? [],
    };
  });

export const createOrganizationGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; name: string; description?: string }) => ({
    organizationId: input.organizationId,
    name: input.name.trim(),
    description: input.description?.trim() || null,
  }))
  .handler(async ({ data, context }) => {
    if (!data.organizationId || !data.name) throw new Error("Organization and group name required");
    await requireOrganizationManager(context.supabase, data.organizationId, context.userId);
    const { data: group, error } = await context.supabase
      .from("organization_groups")
      .insert({
        organization_id: data.organizationId,
        name: data.name,
        description: data.description,
        created_by: context.userId,
      })
      .select("id, name, description")
      .single();
    if (error) throw new Error(error.message);
    return group;
  });

export const inviteOrganizationMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      organizationId: string;
      email: string;
      role: "admin" | "developer" | "member";
      groupId?: string;
    }) => ({
      organizationId: input.organizationId,
      email: input.email.trim().toLowerCase(),
      role: input.role,
      groupId: input.groupId || null,
    }),
  )
  .handler(async ({ data, context }) => {
    if (!data.organizationId || !/^\S+@\S+\.\S+$/.test(data.email)) {
      throw new Error("A valid email address is required");
    }
    await requireOrganizationManager(context.supabase, data.organizationId, context.userId);

    let targetUserId: string | undefined;
    for (let page = 1; page <= 5 && !targetUserId; page += 1) {
      const { data: usersPage, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: 100,
      });
      if (error) throw new Error(error.message);
      targetUserId = usersPage.users.find((user) => user.email?.toLowerCase() === data.email)?.id;
      if (usersPage.users.length < 100) break;
    }

    let invited = false;
    if (!targetUserId) {
      const redirectTo = `${process.env["VITE_APP_URL"] ?? "https://open-connect.site"}/auth`;
      const { data: invite, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
        redirectTo,
        data: { invited_to_organization: data.organizationId },
      });
      if (error) throw new Error(error.message);
      targetUserId = invite.user.id;
      invited = true;
    }

    const { error: memberError } = await context.supabase.from("organization_members").upsert(
      {
        organization_id: data.organizationId,
        user_id: targetUserId,
        role: data.role,
      },
      { onConflict: "organization_id,user_id" },
    );
    if (memberError) throw new Error(memberError.message);

    if (data.groupId) {
      const { data: group, error: lookupGroupError } = await context.supabase
        .from("organization_groups")
        .select("id")
        .eq("id", data.groupId)
        .eq("organization_id", data.organizationId)
        .maybeSingle();
      if (lookupGroupError) throw new Error(lookupGroupError.message);
      if (!group) throw new Error("Choose a group from this organization");
      const { error: groupError } = await context.supabase
        .from("organization_group_members")
        .upsert(
          {
            organization_id: data.organizationId,
            group_id: data.groupId,
            user_id: targetUserId,
            added_by: context.userId,
          },
          { onConflict: "group_id,user_id" },
        );
      if (groupError) throw new Error(groupError.message);
    }

    await context.supabase.from("organization_invitations").upsert(
      {
        organization_id: data.organizationId,
        email: data.email,
        role: data.role,
        invited_by: context.userId,
        invited_user_id: targetUserId,
        status: invited ? "pending" : "accepted",
      },
      { onConflict: "organization_id,email" },
    );
    return { email: data.email, invited };
  });

export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input?: { organizationId?: string }) => ({
    organizationId: input?.organizationId ?? null,
  }))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("projects")
      .select(
        "id, organization_id, workspace_id, name, slug, description, created_at, organizations(name, slug), workspaces(name, slug)",
      )
      .order("created_at", { ascending: false });
    if (data.organizationId) q = q.eq("organization_id", data.organizationId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listWorkspaces = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input?: { organizationId?: string }) => ({
    organizationId: input?.organizationId ?? null,
  }))
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("workspaces")
      .select("id, organization_id, name, slug, description, created_at, organizations(name, slug)")
      .eq("slug", "hillstreet")
      .order("created_at", { ascending: false });
    if (data.organizationId) query = query.eq("organization_id", data.organizationId);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; name: string; description?: string }) => ({
    organizationId: input.organizationId,
    name: input.name.trim(),
    description: input.description?.trim() || null,
  }))
  .handler(async () => {
    throw new Error("Open-Connect uses one HillStreet workspace. Create a project instead.");
  });

/** Projects the current user can access via project_members. */
export const listMyProjectMemberships = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("project_members")
      .select(
        "id, role, project_id, projects(id, name, slug, organization_id, organizations(name, slug))",
      )
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** List Claude-style environments for a project. */
export const listProjectEnvironments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { projectId: string }) => ({
    projectId: input.projectId,
  }))
  .handler(async ({ data, context }) => {
    if (!data.projectId) throw new Error("projectId required");
    const { data: rows, error } = await context.supabase
      .from("environments")
      .select("id, project_id, name, slug, is_default, created_at")
      .eq("project_id", data.projectId)
      .order("slug", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Idempotent seed of Development / Staging / Production if missing. */
export const ensureProjectEnvironments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { projectId: string }) => ({
    projectId: input.projectId,
  }))
  .handler(async ({ data, context }) => {
    if (!data.projectId) throw new Error("projectId required");
    const { data: existing, error: listErr } = await context.supabase
      .from("environments")
      .select("slug")
      .eq("project_id", data.projectId);
    if (listErr) throw new Error(listErr.message);
    const have = new Set((existing ?? []).map((e) => e.slug));
    const missing = DEFAULT_ENVIRONMENTS.filter((e) => !have.has(e.slug));
    if (missing.length) {
      const { error } = await context.supabase.from("environments").insert(
        missing.map((e) => ({
          project_id: data.projectId,
          name: e.name,
          slug: e.slug,
          is_default: e.is_default,
        })),
      );
      if (error) throw new Error(error.message);
    }
    const { data: rows, error } = await context.supabase
      .from("environments")
      .select("id, project_id, name, slug, is_default, created_at")
      .eq("project_id", data.projectId)
      .order("slug", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; name: string; description?: string }) => ({
    organizationId: input.organizationId,
    name: (input?.name ?? "").trim(),
    description: (input?.description ?? "").trim() || null,
  }))
  .handler(async ({ data, context }) => {
    if (!data.name) throw new Error("Project name required");
    if (!data.organizationId) throw new Error("Pick an organization");
    await requireOrganizationManager(context.supabase, data.organizationId, context.userId);
    const { data: workspace, error: workspaceError } = await context.supabase
      .from("workspaces")
      .select("id")
      .eq("organization_id", data.organizationId)
      .eq("slug", "hillstreet")
      .single();
    if (workspaceError || !workspace) throw new Error("HillStreet workspace is unavailable");
    const slug = slugify(data.name) || "project";
    const { data: project, error } = await context.supabase
      .from("projects")
      .insert({
        organization_id: data.organizationId,
        workspace_id: workspace.id,
        name: data.name,
        slug: `${slug}-${Date.now().toString(36).slice(-4)}`,
        description: data.description,
        created_by: context.userId,
      })
      .select("id, name, slug, organization_id")
      .single();
    if (error) throw new Error(error.message);

    await context.supabase.from("project_members").insert({
      project_id: project.id,
      user_id: context.userId,
      role: "admin",
    });

    await context.supabase.from("environments").insert(
      DEFAULT_ENVIRONMENTS.map((e) => ({
        project_id: project.id,
        name: e.name,
        slug: e.slug,
        is_default: e.is_default,
      })),
    );

    return project;
  });

export const deleteProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { projectId: string }) => ({ projectId: input?.projectId ?? "" }))
  .handler(async ({ data, context }) => {
    if (!data.projectId) throw new Error("Project required");
    const { data: project, error: projectError } = await context.supabase
      .from("projects")
      .select("id, organization_id, name, slug")
      .eq("id", data.projectId)
      .single();
    if (projectError || !project) throw new Error("Project not found or access denied");

    await requireOrganizationManager(context.supabase, project.organization_id, context.userId);
    const correlationId = crypto.randomUUID();
    const { data: audit, error: auditError } = await supabaseAdmin
      .from("control_audit_events")
      .insert({
        tenant_id: project.organization_id,
        actor_id: context.userId,
        agent_id: "open-connect-ui",
        capability: "projects.delete",
        target: `project:${project.id}`,
        environment: "production",
        result: "requested",
        correlation_id: correlationId,
        evidence: { project_name: project.name, project_slug: project.slug },
      })
      .select("id")
      .single();
    if (auditError || !audit) throw new Error("Deletion audit is unavailable; project not deleted");

    const { error } = await context.supabase.from("projects").delete().eq("id", project.id);
    if (error) {
      await supabaseAdmin
        .from("control_audit_events")
        .update({ result: "failure", evidence: { error: "project_delete_failed" } })
        .eq("id", audit.id);
      throw new Error(error.message);
    }
    await supabaseAdmin
      .from("control_audit_events")
      .update({ result: "success" })
      .eq("id", audit.id);

    return { id: project.id, name: project.name };
  });

async function requireProjectScopeAdmin(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
) {
  const { data: project } = await supabase
    .from("projects")
    .select("organization_id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) throw new Error("Project not found or access denied");
  const { data: orgMembership } = await supabase
    .from("organization_members")
    .select("role")
    .eq("organization_id", project.organization_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (orgMembership?.role === "admin") return;
  const { data: projectMembership } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (projectMembership?.role !== "admin") {
    throw new Error("Project admin or organization admin required");
  }
}

export const renameProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { projectId: string; name: string }) => ({
    projectId: input?.projectId ?? "",
    name: (input?.name ?? "").trim().slice(0, 120),
  }))
  .handler(async ({ data, context }) => {
    if (!data.projectId || data.name.length < 2) throw new Error("A project name is required");
    const { data: project, error: projectError } = await context.supabase
      .from("projects")
      .select("id, organization_id, name")
      .eq("id", data.projectId)
      .single();
    if (projectError || !project) throw new Error("Project not found or access denied");
    await requireProjectScopeAdmin(context.supabase, project.id, context.userId);

    const { data: updated, error } = await context.supabase
      .from("projects")
      .update({ name: data.name })
      .eq("id", project.id)
      .select("id, name, slug")
      .single();
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("control_audit_events").insert({
      tenant_id: project.organization_id,
      actor_id: context.userId,
      agent_id: "open-connect-ui",
      capability: "projects.rename",
      target: `project:${project.id}`,
      environment: "production",
      result: "success",
      correlation_id: crypto.randomUUID(),
      evidence: { previous_name: project.name, new_name: data.name },
    });
    return updated;
  });

export const updateOrganizationMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; userId: string; role: string }) => ({
    organizationId: input.organizationId,
    userId: input.userId,
    role: input.role as "admin" | "developer" | "member",
  }))
  .handler(async ({ data, context }) => {
    if (!data.organizationId || !data.userId) throw new Error("Organization and member required");
    if (!["admin", "developer", "member"].includes(data.role)) {
      throw new Error("Choose Admin, Developer, or Member");
    }
    await requireOrganizationManager(context.supabase, data.organizationId, context.userId);
    const { data: current, error: currentError } = await context.supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", data.organizationId)
      .eq("user_id", data.userId)
      .maybeSingle();
    if (currentError) throw new Error(currentError.message);
    if (!current) throw new Error("Organization member not found");
    if (current.role === "admin" && data.role !== "admin") {
      const { count, error } = await context.supabase
        .from("organization_members")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", data.organizationId)
        .eq("role", "admin");
      if (error) throw new Error(error.message);
      if ((count ?? 0) <= 1) throw new Error("The organization must keep at least one admin");
    }
    const { error } = await context.supabase
      .from("organization_members")
      .update({ role: data.role })
      .eq("organization_id", data.organizationId)
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    await context.supabase
      .from("organization_invitations")
      .update({ role: data.role, updated_at: new Date().toISOString() })
      .eq("organization_id", data.organizationId)
      .eq("invited_user_id", data.userId);
    return { ok: true };
  });

export const removeOrganizationMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; userId: string }) => ({
    organizationId: input.organizationId,
    userId: input.userId,
  }))
  .handler(async ({ data, context }) => {
    if (!data.organizationId || !data.userId) throw new Error("Organization and member required");
    await requireOrganizationManager(context.supabase, data.organizationId, context.userId);
    const { data: member, error: memberError } = await context.supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", data.organizationId)
      .eq("user_id", data.userId)
      .maybeSingle();
    if (memberError) throw new Error(memberError.message);
    if (!member) throw new Error("Organization member not found");
    if (member.role === "admin") {
      const { count, error } = await context.supabase
        .from("organization_members")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", data.organizationId)
        .eq("role", "admin");
      if (error) throw new Error(error.message);
      if ((count ?? 0) <= 1) throw new Error("The organization must keep at least one admin");
    }
    const { data: projects, error: projectsError } = await context.supabase
      .from("projects")
      .select("id")
      .eq("organization_id", data.organizationId);
    if (projectsError) throw new Error(projectsError.message);
    const projectIds = (projects ?? []).map((project) => project.id);
    if (projectIds.length) {
      const { error } = await context.supabase
        .from("project_members")
        .delete()
        .eq("user_id", data.userId)
        .in("project_id", projectIds);
      if (error) throw new Error(error.message);
    }
    const { error: groupError } = await context.supabase
      .from("organization_group_members")
      .delete()
      .eq("organization_id", data.organizationId)
      .eq("user_id", data.userId);
    if (groupError) throw new Error(groupError.message);
    const { error: invitationError } = await context.supabase
      .from("organization_invitations")
      .delete()
      .eq("organization_id", data.organizationId)
      .eq("invited_user_id", data.userId)
      .eq("status", "pending");
    if (invitationError) throw new Error(invitationError.message);
    const { error } = await context.supabase
      .from("organization_members")
      .delete()
      .eq("organization_id", data.organizationId)
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setOrganizationMemberGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; userId: string; groupIds: string[] }) => ({
    organizationId: input.organizationId,
    userId: input.userId,
    groupIds: [...new Set(input.groupIds ?? [])],
  }))
  .handler(async ({ data, context }) => {
    if (!data.organizationId || !data.userId) throw new Error("Organization and member required");
    await requireOrganizationManager(context.supabase, data.organizationId, context.userId);
    const { data: member, error: memberError } = await context.supabase
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", data.organizationId)
      .eq("user_id", data.userId)
      .maybeSingle();
    if (memberError) throw new Error(memberError.message);
    if (!member) throw new Error("Group assignment requires an active organization member");
    const { data: groups, error: groupsError } = await context.supabase
      .from("organization_groups")
      .select("id")
      .eq("organization_id", data.organizationId)
      .in("id", data.groupIds.length ? data.groupIds : ["00000000-0000-0000-0000-000000000000"]);
    if (groupsError) throw new Error(groupsError.message);
    if ((groups ?? []).length !== data.groupIds.length) {
      throw new Error("One or more selected groups are outside this organization");
    }
    const { data: existing, error: existingError } = await context.supabase
      .from("organization_group_members")
      .select("group_id")
      .eq("organization_id", data.organizationId)
      .eq("user_id", data.userId);
    if (existingError) throw new Error(existingError.message);
    const desired = new Set(data.groupIds);
    for (const groupId of data.groupIds) {
      const { error } = await context.supabase
        .from("organization_group_members")
        .upsert(
          {
            organization_id: data.organizationId,
            group_id: groupId,
            user_id: data.userId,
            added_by: context.userId,
          },
          { onConflict: "group_id,user_id" },
        );
      if (error) throw new Error(error.message);
    }
    for (const row of existing ?? []) {
      if (desired.has(row.group_id)) continue;
      const { error } = await context.supabase
        .from("organization_group_members")
        .delete()
        .eq("organization_id", data.organizationId)
        .eq("group_id", row.group_id)
        .eq("user_id", data.userId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const renameOrganizationGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; groupId: string; name: string }) => ({
    organizationId: input.organizationId,
    groupId: input.groupId,
    name: input.name.trim().slice(0, 80),
  }))
  .handler(async ({ data, context }) => {
    if (!data.name) throw new Error("Group name required");
    await requireOrganizationManager(context.supabase, data.organizationId, context.userId);
    const { error } = await context.supabase
      .from("organization_groups")
      .update({ name: data.name })
      .eq("organization_id", data.organizationId)
      .eq("id", data.groupId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteOrganizationGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string; groupId: string }) => ({
    organizationId: input.organizationId,
    groupId: input.groupId,
  }))
  .handler(async ({ data, context }) => {
    await requireOrganizationManager(context.supabase, data.organizationId, context.userId);
    const { error } = await context.supabase
      .from("organization_groups")
      .delete()
      .eq("organization_id", data.organizationId)
      .eq("id", data.groupId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
