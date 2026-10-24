import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type ProfileDomain = { domain: string; cookie_count?: number };

function profileDomains(profile: object): Array<{ domain: string; cookies: number }> {
  const domains = (profile as { domains?: ProfileDomain[] }).domains;
  return Array.isArray(domains)
    ? domains.map((item) => ({ domain: item.domain, cookies: item.cookie_count ?? 0 }))
    : [];
}

/** Connection, default profile and recent runs for the Cloud Browser console. */
export const getCloudBrowserOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { cloudBrowserClient, CloudBrowserNotConnectedError, CLOUD_BROWSER_SETUP_HINT } =
      await import("@/lib/tinyfish.server");
    const { summarizeRun } = await import("@/lib/tinyfish");
    let session;
    try {
      session = await cloudBrowserClient(context.userId);
    } catch (error) {
      if (error instanceof CloudBrowserNotConnectedError)
        return { connected: false as const, setup: CLOUD_BROWSER_SETUP_HINT };
      throw error;
    }
    const [profiles, runs] = await Promise.all([
      session.client.listProfiles().catch(() => ({ profiles: [] })),
      session.client.listRuns({ limit: 15 }),
    ]);
    const defaultProfile =
      profiles.profiles.find((profile) => profile.is_default) ?? profiles.profiles[0] ?? null;
    const profile = defaultProfile
      ? await session.client.getProfile(defaultProfile.id).catch(() => defaultProfile)
      : null;
    return {
      connected: true as const,
      connection: session.connection,
      profiles: profiles.profiles.map((item) => ({
        id: item.id,
        name: item.name,
        is_default: item.is_default === true,
        domain_count: item.domain_count ?? 0,
      })),
      defaultProfile: profile
        ? {
            id: profile.id,
            name: profile.name,
            domains: profileDomains(profile),
          }
        : null,
      runs: (runs.data ?? []).map(summarizeRun),
    };
  });

export const startCloudBrowserRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      url: z.string().min(1).max(2048),
      goal: z.string().min(1).max(8000),
      profile_id: z.string().max(128).optional(),
      use_profile: z.boolean().default(true),
      stealth: z.boolean().default(false),
    }),
  )
  .handler(async ({ data, context }) => {
    const { cloudBrowserClient } = await import("@/lib/tinyfish.server");
    const { normalizeStartRun, startRunWithLiveView } = await import("@/lib/tinyfish");
    const { client } = await cloudBrowserClient(context.userId);
    return startRunWithLiveView(client, normalizeStartRun(data), { waitMs: 6000 });
  });

export const getCloudBrowserRun = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ runId: z.string().min(1).max(128) }))
  .handler(async ({ data, context }) => {
    const { cloudBrowserClient } = await import("@/lib/tinyfish.server");
    const { summarizeRun } = await import("@/lib/tinyfish");
    const { client } = await cloudBrowserClient(context.userId);
    return summarizeRun(await client.getRun(data.runId));
  });

export const cancelCloudBrowserRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ runId: z.string().min(1).max(128) }))
  .handler(async ({ data, context }) => {
    const { cloudBrowserClient } = await import("@/lib/tinyfish.server");
    const { client } = await cloudBrowserClient(context.userId);
    await client.cancelRun(data.runId);
    return { cancelled: true };
  });
