import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasRole } from "./rbac";
import { sandboxSummary } from "./sandbox-state";

/** Deployment sandbox credentials are restricted to platform administrators. */
export const managePlatformSandbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.discriminatedUnion("action", [
      z.object({ action: z.literal("status") }),
      z.object({ action: z.literal("create"), spendApproved: z.literal(true) }),
      z.object({
        action: z.literal("stop"),
        id: z.string().regex(/^[A-Za-z0-9_-]{6,128}$/),
        confirm: z.literal(true),
      }),
    ]),
  )
  .handler(async ({ data, context }) => {
    const { data: roles, error } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (
      error ||
      !hasRole(
        (roles ?? []).map((row) => row.role),
        "admin",
      )
    )
      throw new Error("Platform administrator access required for the deployment sandbox account.");
    const { e2bConfig, e2bHealth, listE2bSandboxes, createE2bSandbox, killE2bSandbox } =
      await import("./e2b.server");
    if (!e2bConfig().configured)
      return { configured: false, sandboxes: [], created: null, stopRequested: false };
    try {
      if (data.action === "create") {
        const created = sandboxSummary(
          await createE2bSandbox({
            template: "base",
            timeout: 300,
            metadata: { actor_id: context.userId },
          }),
        );
        if (!created.id) throw new Error("Missing sandbox identifier");
        return { configured: true, sandboxes: [], created, stopRequested: false };
      }
      if (data.action === "stop") {
        await killE2bSandbox(data.id);
        return { configured: true, sandboxes: [], created: null, stopRequested: true };
      }
      await e2bHealth();
      const rows: unknown = await listE2bSandboxes(100);
      if (!Array.isArray(rows)) throw new Error("Unexpected sandbox list");
      return {
        configured: true,
        sandboxes: rows.map(sandboxSummary),
        created: null,
        stopRequested: false,
      };
    } catch {
      throw new Error(
        "Sandbox operation was not confirmed. Refresh the list before retrying; an unconfirmed create may have started.",
      );
    }
  });
