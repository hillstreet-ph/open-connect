import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { browserPreferences, verificationInput } from "./browser-verification";
export const getGlobalBrowserAutomation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) =>
    (await import("./browser-verification.server")).globalBrowserStatus(context.userId),
  );
export const configureGlobalBrowserAutomation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(browserPreferences)
  .handler(async ({ data, context }) =>
    (await import("./browser-verification.server")).saveBrowserPreferences(context.userId, data),
  );
export const startBrowserVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(verificationInput)
  .handler(async ({ data, context }) =>
    (await import("./browser-verification.server")).beginVerification(context.userId, data),
  );
export const getBrowserVerification = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) =>
    (await import("./browser-verification.server")).readVerification(context.userId, data.id),
  );
