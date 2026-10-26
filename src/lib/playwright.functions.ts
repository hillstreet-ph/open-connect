import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
export const runPlaywrightTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ goal: z.string().trim().min(1).max(8000) }))
  .handler(async ({ context, data }) => {
    const { runPlaywrightTask: run } = await import("@/lib/playwright-agent.server");
    return run(context.userId, data.goal);
  });
export const listPlaywrightTools = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { playwrightWorker } = await import("@/lib/playwright-worker.server");
    return playwrightWorker(context.userId);
  });
export const callPlaywrightTool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({ name: z.string().min(1).max(100), arguments: z.record(z.string(), z.unknown()) }),
  )
  .handler(async ({ context, data }) => {
    const { playwrightWorker } = await import("@/lib/playwright-worker.server");
    return playwrightWorker(context.userId, data.name, data.arguments);
  });
