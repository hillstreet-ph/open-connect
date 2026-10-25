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
      session.client
        .listProfiles()
        .then((result) => ({ ...result, available: true }))
        .catch(() => ({ profiles: [], available: false })),
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
      profilesAvailable: profiles.available,
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
      max_duration_seconds: z.number().int().min(30).max(3600).default(600),
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

/** Profile operations always use the signed-in user's own provider credential. */
export const getCloudBrowserProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ profileId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/) }))
  .handler(async ({ data, context }) => {
    const { cloudBrowserClient } = await import("@/lib/tinyfish.server");
    const { client } = await cloudBrowserClient(context.userId);
    const profile = await client.getProfile(data.profileId);
    return { id: profile.id, name: profile.name, domains: profileDomains(profile) };
  });

export const saveCloudBrowserProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      profileId: z
        .string()
        .regex(/^[A-Za-z0-9_-]{1,128}$/)
        .optional(),
      name: z.string().trim().min(1).max(100),
      set_as_default: z.boolean().default(false),
    }),
  )
  .handler(async ({ data, context }) => {
    const { cloudBrowserClient } = await import("@/lib/tinyfish.server");
    const { client } = await cloudBrowserClient(context.userId);
    const input = { name: data.name, set_as_default: data.set_as_default };
    const profile = data.profileId
      ? await client.updateProfile(data.profileId, input)
      : await client.createProfile(input);
    return { id: profile.id, name: profile.name };
  });

export const createDirectCloudBrowser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      url: z.string().min(1).max(2048),
      profileId: z
        .string()
        .regex(/^[A-Za-z0-9_-]{1,128}$/)
        .optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { cloudBrowserClient } = await import("@/lib/tinyfish.server");
    const { browserNavigationUrl } = await import("@/lib/browser-control");
    const { client } = await cloudBrowserClient(context.userId);
    const url = browserNavigationUrl(data.url);
    const session = data.profileId
      ? await client.startProfileSetup(data.profileId, url)
      : await client.createBrowserSession({ url, timeout_seconds: 300 });
    return {
      sessionId: session.session_id,
      cdpUrl: session.cdp_url ?? "",
      profileId: data.profileId ?? null,
    };
  });

export const finishDirectCloudBrowser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      sessionId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
      profileId: z
        .string()
        .regex(/^[A-Za-z0-9_-]{1,128}$/)
        .nullable(),
      save: z.boolean(),
    }),
  )
  .handler(async ({ data, context }) => {
    const { cloudBrowserClient } = await import("@/lib/tinyfish.server");
    const { client } = await cloudBrowserClient(context.userId);
    if (data.save && !data.profileId)
      throw new Error("Select a profile before saving login state.");
    if (data.profileId) {
      const result = await client.finishProfileSetup(
        data.profileId,
        data.sessionId,
        data.save ? "save" : "cancel",
      );
      if (data.save) await client.finishProfileSetup(data.profileId, data.sessionId, "cancel");
      return {
        closed: true,
        saved: data.save,
        domainsUpdated: Array.isArray(result["domains_updated"])
          ? result["domains_updated"].map(String)
          : [],
        domainsFailed: Array.isArray(result["domains_failed"])
          ? result["domains_failed"].map(String)
          : [],
      };
    }
    await client.closeBrowserSession(data.sessionId);
    return { closed: true, saved: false, domainsUpdated: [], domainsFailed: [] };
  });
