import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  describeLocation,
  isPrivateIp,
  locationFallback,
  parseUserAgent,
  type GeoLocation,
  type SessionActivity,
} from "@/lib/login-activity";
import { kvGet, kvPut } from "@/lib/kv.server";

type SessionRow = {
  id: string;
  created_at: string;
  last_active_at: string;
  user_agent: string | null;
  ip: string | null;
  is_current: boolean;
};

const GEO_TTL_SECONDS = 60 * 60 * 24 * 7;
const GEO_TIMEOUT_MS = 2500;

function normalizedIp(ip: string | null): string | null {
  if (!ip) return null;
  const trimmed = ip.trim().toLowerCase();
  return trimmed.startsWith("::ffff:") ? trimmed.slice(7) : trimmed;
}

/** Coarse city/region/country for a public IP, cached in KV to respect rate limits. */
async function lookupGeo(ip: string): Promise<GeoLocation | null> {
  const key = `geo:v1:${ip}`;
  const cached = await kvGet(key);
  if (cached !== null) {
    if (!cached || cached === "null") return null;
    try {
      return JSON.parse(cached) as GeoLocation;
    } catch {
      return null;
    }
  }

  try {
    const response = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      signal: AbortSignal.timeout(GEO_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as GeoLocation & { success?: boolean };
    const geo: GeoLocation | null =
      body.success === false
        ? null
        : {
            city: body.city ?? null,
            region: body.region ?? null,
            country: body.country ?? null,
            countryCode: body.countryCode ?? null,
          };
    await kvPut(key, JSON.stringify(geo), GEO_TTL_SECONDS);
    return geo;
  } catch {
    return null;
  }
}

async function attachLocations(rows: SessionRow[]): Promise<SessionActivity[]> {
  const unique = [
    ...new Set(rows.map((row) => normalizedIp(row.ip)).filter((ip): ip is string => Boolean(ip))),
  ];
  const publicIps = unique.filter((ip) => !isPrivateIp(ip));

  const geo = new Map<string, GeoLocation | null>();
  await Promise.all(
    publicIps.map(async (ip) => {
      geo.set(ip, await lookupGeo(ip));
    }),
  );

  return rows.map((row) => {
    const ip = normalizedIp(row.ip);
    const place = ip && !isPrivateIp(ip) ? describeLocation(geo.get(ip) ?? null) : null;
    return {
      id: row.id,
      created_at: row.created_at,
      last_active_at: row.last_active_at,
      user_agent: row.user_agent,
      ip,
      is_current: row.is_current === true,
      location: place ?? locationFallback(ip),
    };
  });
}

export const listLoginActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SessionActivity[]> => {
    const { data, error } = await (context.supabase as SupabaseClient).rpc("oc_login_activity");
    if (error) throw new Error(error.message);
    return attachLocations((data ?? []) as SessionRow[]);
  });

export const revokeLoginSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { sessionId: string }) => ({
    sessionId: String(input?.sessionId ?? "").trim(),
  }))
  .handler(async ({ data, context }) => {
    if (!data.sessionId) throw new Error("A session is required");
    const { data: revoked, error } = await (context.supabase as SupabaseClient).rpc(
      "oc_revoke_login_session",
      { p_session_id: data.sessionId },
    );
    if (error) throw new Error(error.message);
    if (revoked !== true) throw new Error("That session is no longer active");
    return { revoked: true };
  });

export const revokeOtherLoginSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as SupabaseClient).rpc(
      "oc_revoke_other_login_sessions",
    );
    if (error) throw new Error(error.message);
    return { revoked: Number(data ?? 0) };
  });
