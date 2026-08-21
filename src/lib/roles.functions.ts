import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRole, ROLE_RANK, type AppRole, ALL_ROLES } from "@/lib/rbac";

async function loadRoles(
  supabase: { from: (t: string) => any },
  userId: string,
): Promise<AppRole[]> {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: { role: AppRole }) => r.role);
  return roles.length ? roles : (["user"] as AppRole[]);
}

export const getMyRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    return loadRoles(context.supabase, context.userId);
  });

export const listRoleAssignments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const mine = await loadRoles(context.supabase, context.userId);
    if (!hasRole(mine, "admin")) throw new Error("Forbidden: admin required");

    const { data, error } = await context.supabase
      .from("user_roles")
      .select("id, user_id, role, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const assignRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { user_id: string; role: string }) => ({
    user_id: (input?.user_id ?? "").trim(),
    role: (input?.role ?? "user").trim() as AppRole,
  }))
  .handler(async ({ data, context }) => {
    const mine = await loadRoles(context.supabase, context.userId);
    if (!hasRole(mine, "admin")) throw new Error("Forbidden: admin required");
    if (!ALL_ROLES.includes(data.role)) throw new Error("Invalid role");
    if (!data.user_id) throw new Error("user_id required");

    // Only owners may grant/revoke owner; admins may not escalate past admin
    if (data.role === "owner" && !hasRole(mine, "owner")) {
      throw new Error("Only owners can assign the owner role");
    }
    if (ROLE_RANK[data.role] > ROLE_RANK[mine.includes("owner") ? "owner" : "admin"] && !hasRole(mine, "owner")) {
      throw new Error("Cannot assign a role higher than your own");
    }

    const { data: row, error } = await context.supabase
      .from("user_roles")
      .upsert(
        { user_id: data.user_id, role: data.role },
        { onConflict: "user_id,role" },
      )
      .select("id, user_id, role, created_at")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const revokeRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { user_id: string; role: string }) => ({
    user_id: (input?.user_id ?? "").trim(),
    role: (input?.role ?? "").trim() as AppRole,
  }))
  .handler(async ({ data, context }) => {
    const mine = await loadRoles(context.supabase, context.userId);
    if (!hasRole(mine, "admin")) throw new Error("Forbidden: admin required");
    if (!data.user_id || !data.role) throw new Error("user_id and role required");
    if (data.role === "owner" && !hasRole(mine, "owner")) {
      throw new Error("Only owners can revoke the owner role");
    }
    if (data.user_id === context.userId && data.role === "admin" && !hasRole(mine, "owner")) {
      throw new Error("Admins cannot revoke their own admin role");
    }

    const { error } = await context.supabase
      .from("user_roles")
      .delete()
      .eq("user_id", data.user_id)
      .eq("role", data.role);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
