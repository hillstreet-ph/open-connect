import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decideControlApproval, type ApprovalDecision } from "@/lib/control-approvals.server";
import { hasRole, type AppRole } from "@/lib/rbac";

export const listMyControlApprovals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = supabaseAdmin as SupabaseClient;
    const { data, error } = await db
      .from("control_approvals")
      .select("id,action,target,environment,risk,state,expires_at,created_at,decided_at")
      .eq("tenant_id", context.userId)
      .eq("requested_by", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error("Could not load your approval requests. Try again.");
    return (data ?? []) as Array<{
      id: string;
      action: string;
      target: string;
      environment: string;
      risk: string;
      state: string;
      expires_at: string;
      created_at: string;
      decided_at: string | null;
    }>;
  });

export const decideMyControlApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string; decision: ApprovalDecision; confirm: boolean }) => input)
  .handler(async ({ context, data }) => {
    const { data: roles, error } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (
      error ||
      !hasRole(
        (roles ?? []).map((row) => row.role as AppRole),
        "admin",
      )
    )
      throw new Error("Admin role required to decide control requests.");
    return decideControlApproval(
      supabaseAdmin as SupabaseClient,
      context.userId,
      data.id,
      data.decision,
      data.confirm,
    );
  });
