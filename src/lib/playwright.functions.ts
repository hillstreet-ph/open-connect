import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
export const runPlaywrightTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ goal: z.string().trim().min(1).max(8000) }))
  .handler(async ({ context, data }) => {
    const { runPlaywrightTask: run } = await import("@/lib/playwright-agent.server");
    const result = await run(context.userId, data.goal);
    const { redactContext } = await import("@/lib/agent-team");
    const { error } = await (context.supabase as import("@supabase/supabase-js").SupabaseClient)
      .from("agent_chats")
      .insert({
        user_id: context.userId,
        title: redactContext(data.goal).slice(0, 120),
        mode: "browser",
        browser_run_id: null,
        messages: [
          { role: "user", content: redactContext(data.goal) },
          { role: "assistant", content: redactContext(result.reply) },
        ],
      });
    return { ...result, history_saved: !error };
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

export const cancelPlaywrightTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { playwrightTaskControl } = await import("@/lib/playwright-worker.server");
    return playwrightTaskControl(context.userId, "cancel");
  });

export const startPlaywrightSignIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      url: z
        .string()
        .url()
        .max(2048)
        .refine((value) => {
          const url = new URL(value);
          return url.protocol === "https:" && !url.username && !url.password;
        }, "Use an HTTPS website address without a password."),
    }),
  )
  .handler(async ({ context, data }) => {
    const { playwrightViewControl } = await import("@/lib/playwright-worker.server");
    const viewer = await playwrightViewControl(context.userId, "start", data.url);
    const origin = new URL(process.env["PLAYWRIGHT_WORKER_URL"]!).origin;
    return {
      url: `${origin}/viewer`,
      token: String(viewer.token),
      expiresAt: String(viewer.expiresAt),
    };
  });
export const endPlaywrightSignIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { playwrightViewControl } = await import("@/lib/playwright-worker.server");
    return playwrightViewControl(context.userId, "end");
  });
