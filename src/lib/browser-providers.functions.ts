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
      solveCaptchas: z.boolean().optional(),
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

/** Reuse exact owned Vault matches with a read-only check; never starts a browser. */
export const getBrowserProviderAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { prepareBrowserVaultConnection } = await import("./browser-vault.server");
    const [browserUseVault, browserbaseVault] = await Promise.all([
      prepareBrowserVaultConnection(context.userId, "browser_use"),
      prepareBrowserVaultConnection(context.userId, "browserbase"),
    ]);
    const { data, error } = await context.supabase
      .from("app_connections")
      .select("provider,status,credential_reference")
      .eq("user_id", context.userId)
      .in("provider", [
        "tinyfish",
        "custom_tinyfish_mcp",
        "browser_use",
        "browserbase",
        "browserbase_tool",
        "browserbase_mcp",
        "browseract",
        "multion",
      ]);
    if (error) throw new Error("Could not check your browser connections.");
    const { providerConnectionStatus } = await import("./browser-provider-selection");
    const owner = process.env["BROWSER_PROVIDER_OWNER_ID"] === context.userId;
    return {
      vault: { browser_use: browserUseVault, browserbase: browserbaseVault },
      browseract: {
        saved: (data ?? []).some(
          (row) => row.provider === "browseract" && row.status === "connected",
        ),
      },
      multion: {
        saved: (data ?? []).some((row) => row.provider === "multion" && row.status === "connected"),
      },
      tinyfish: providerConnectionStatus("tinyfish", data ?? []),
      browser_use: providerConnectionStatus(
        "browser_use",
        data ?? [],
        owner && Boolean(process.env["BROWSER_USE_API_KEY"]),
      ),
      browserbase: providerConnectionStatus(
        "browserbase",
        data ?? [],
        owner && Boolean(process.env["BROWSERBASE_API_KEY"]),
      ),
    };
  });
