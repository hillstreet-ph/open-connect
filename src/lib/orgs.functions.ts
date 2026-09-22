import { createServerFn } from "@tanstack/react-start";
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

export const createOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { name: string }) => ({
    name: (input?.name ?? "").trim(),
  }))
  .handler(async ({ data, context }) => {
    if (!data.name) throw new Error("Organization name required");
    const slug = `${slugify(data.name) || "org"}-${context.userId.slice(0, 6)}`;
    const { data: org, error } = await context.supabase
      .from("organizations")
      .insert({ name: data.name, slug, owner_id: context.userId })
      .select("id, name, slug")
      .single();
    if (error) throw new Error(error.message);

    await context.supabase.from("organization_members").insert({
      organization_id: org.id,
      user_id: context.userId,
      role: "owner",
    });

    return org;
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
  if (role !== "owner" && role !== "admin") {
    throw new Error("Only organization owners and admins can manage people");
  }
}

export const listOrganizationPeople = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { organizationId: string }) => ({ organizationId: input.organizationId }))
  .handler(async ({ data, context }) => {
    if (!data.organizationId) throw new Error("organizationId required");
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
      role: "admin" | "member";
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
      .select("id, organization_id, name, slug, description, created_at, organizations(name, slug)")
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
  .handler(async ({ data, context }) => {
    if (!data.organizationId || !data.name)
      throw new Error("Organization and workspace name required");
    await requireOrganizationManager(context.supabase, data.organizationId, context.userId);
    const { data: workspace, error } = await context.supabase
      .from("workspaces")
      .insert({
        organization_id: data.organizationId,
        name: data.name,
        slug: `${slugify(data.name) || "workspace"}-${Date.now().toString(36).slice(-4)}`,
        description: data.description,
        created_by: context.userId,
      })
      .select("id, organization_id, name, slug")
      .single();
    if (error) throw new Error(error.message);
    return workspace;
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
  .validator(
    (input: {
      organizationId: string;
      workspaceId: string;
      name: string;
      description?: string;
    }) => ({
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
      name: (input?.name ?? "").trim(),
      description: (input?.description ?? "").trim() || null,
    }),
  )
  .handler(async ({ data, context }) => {
    if (!data.name) throw new Error("Project name required");
    if (!data.organizationId) throw new Error("Pick an organization");
    if (!data.workspaceId) throw new Error("Pick a workspace");
    const slug = slugify(data.name) || "project";
    const { data: project, error } = await context.supabase
      .from("projects")
      .insert({
        organization_id: data.organizationId,
        workspace_id: data.workspaceId,
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
      role: "manager",
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
