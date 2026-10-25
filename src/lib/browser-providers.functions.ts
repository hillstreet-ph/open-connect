import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const handle = z.object({
  provider: z.enum(["browser_use", "browserbase"]),
  connectionId: z.string().uuid().nullable(),
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  signature: z.string().regex(/^[a-f0-9]{64}$/),
});
export const startAdditionalBrowser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      provider: z.enum(["browser_use", "browserbase"]),
      task: z.string().trim().min(1).max(8000),
      model: z.string().max(100).optional(),
      modelParams: z.record(z.string(), z.unknown()).optional(),
      spendApproved: z.literal(true),
    }),
  )
  .handler(async ({ data, context }) =>
    (await import("./browser-providers.server")).publicProviderCall(async () =>
      (await import("./browser-providers.server")).startProvider(context.userId, data),
    ),
  );
export const readAdditionalBrowser = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(handle)
  .handler(async ({ data, context }) =>
    (await import("./browser-providers.server")).publicProviderCall(async () =>
      (await import("./browser-providers.server")).readProvider(context.userId, data),
    ),
  );
export const stopAdditionalBrowser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(handle)
  .handler(async ({ data, context }) =>
    (await import("./browser-providers.server")).publicProviderCall(async () =>
      (await import("./browser-providers.server")).readProvider(context.userId, data, true),
    ),
  );
