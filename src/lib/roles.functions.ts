import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasRole, type AppRole } from "@/lib/rbac";

const ASSIGNABLE_ROLES: AppRole[] = ["user", "developer", "admin"];
const MANAGEABLE_ROLES: AppRole[] = ASSIGNABLE_ROLES;

async function loadRoles(supabase: SupabaseClient, userId: string): Promise<AppRole[]> {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: { role: AppRole }) => r.role);
  return roles.length ? roles : (["user"] as AppRole[]);
}

async function findUserIdByEmail(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) throw new Error("Enter a valid account email");
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(error.message);
  const user = data.users.find((candidate) => candidate.email?.toLowerCase() === normalized);
  if (!user) {
    throw new Error("No account found for that email. Invite them to the organization first.");
  }
  return user.id;
}

export const getMyRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => loadRoles(context.supabase, context.userId));

export const listRoleAssignments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const mine = await loadRoles(context.supabase, context.userId);
    if (!hasRole(mine, "admin")) throw new Error("Forbidden: admin required");

    const { data, error } = await context.supabase
      .from("user_roles")
      .select("id, user_id, role, created_at")
      .in("role", MANAGEABLE_ROLES)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    return Promise.all(
      (data ?? []).map(async (row) => {
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(row.user_id);
        return { ...row, email: userData.user?.email ?? "" };
      }),
    );
  });

export const assignRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { email: string; role: string }) => ({
    email: (input?.email ?? "").trim().toLowerCase(),
    role: (input?.role ?? "user").trim() as AppRole,
  }))
  .handler(async ({ data, context }) => {
    const mine = await loadRoles(context.supabase, context.userId);
    if (!hasRole(mine, "admin")) throw new Error("Forbidden: admin required");
    if (!ASSIGNABLE_ROLES.includes(data.role)) {
      throw new Error("Choose Member, Developer, or Admin");
    }

    const userId = await findUserIdByEmail(data.email);
    const { data: row, error } = await context.supabase
      .from("user_roles")
      .upsert({ user_id: userId, role: data.role }, { onConflict: "user_id,role" })
      .select("id, user_id, role, created_at")
      .single();
    if (error) throw new Error(error.message);
    const { error: cleanupError } = await context.supabase
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .in(
        "role",
        ASSIGNABLE_ROLES.filter((role) => role !== data.role),
      );
    if (cleanupError) throw new Error(cleanupError.message);
    return { ...row, email: data.email };
  });

export const revokeRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { user_id: string; role: string }) => ({
    user_id: (input?.user_id ?? "").trim(),
    role: (input?.role ?? "").trim() as AppRole,
  }))
  .handler(async ({ data, context }) => {
    const mine = await loadRoles(context.supabase, context.userId);
    if (!hasRole(mine, "admin")) throw new Error("Forbidden: admin required");
    if (!data.user_id || !data.role) throw new Error("user_id and role required");
    if (!MANAGEABLE_ROLES.includes(data.role)) {
      throw new Error("This platform role cannot be managed here");
    }
    if (data.user_id === context.userId && data.role === "admin") {
      throw new Error("You cannot revoke your own admin role");
    }
    if (data.role === "admin") {
      const { count, error: countError } = await context.supabase
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin");
      if (countError) throw new Error(countError.message);
      if ((count ?? 0) <= 1) throw new Error("The platform must keep at least one admin");
    }

    const { error } = await context.supabase
      .from("user_roles")
      .delete()
      .eq("user_id", data.user_id)
      .eq("role", data.role);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
