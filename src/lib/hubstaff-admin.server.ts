const HUBSTAFF_API = "https://api.hubstaff.com";
const HUBSTAFF_TOKEN_ENDPOINT = "https://account.hubstaff.com/access_tokens";
const PROVIDER = "hubstaff_admin";
const LEGACY_CREDENTIAL_NAME = "hubstaff_admin_refresh_token";

let cachedLegacyAccess: { token: string; expiresAt: number } | null = null;

type HubstaffRequestDependencies = {
  resolveUserCredential?: (userId: string) => Promise<string | null>;
  legacyAccessToken?: () => Promise<string>;
  fetch?: typeof globalThis.fetch;
};

export function hubstaffAdminConfig() {
  return {
    configured: true,
    endpoint: HUBSTAFF_API,
    provider: PROVIDER,
    credential: LEGACY_CREDENTIAL_NAME,
  };
}

function parseCredentialValue(value: string) {
  try {
    const payload = JSON.parse(value) as { credential?: unknown };
    return typeof payload.credential === "string" ? payload.credential.trim() : value.trim();
  } catch {
    return value.trim();
  }
}

async function readUserCredential(userId: string): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: connection, error: connectionError } = await supabaseAdmin
    .from("app_connections")
    .select("credential_reference")
    .eq("user_id", userId)
    .eq("provider", PROVIDER)
    .eq("status", "connected")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (connectionError) throw new Error("Unable to load the Hubstaff Admin connection.");
  if (!connection?.credential_reference) return null;

  const match = connection.credential_reference.match(
    /^credential:\/\/[^/]+\/([0-9a-f-]{36})$/i,
  );
  if (!match) throw new Error("Hubstaff Admin has an invalid credential reference.");

  const { data, error } = await supabaseAdmin.rpc("resolve_connection_credential", {
    p_user_id: userId,
    p_credential_id: match[1]!,
  });
  if (error || typeof data !== "string" || !data) {
    throw new Error("Hubstaff Admin credential could not be resolved.");
  }
  const credential = parseCredentialValue(data);
  if (!credential) throw new Error("Hubstaff Admin credential is empty.");
  return credential;
}

async function readLegacyRefreshToken() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("get_service_credential", {
    p_name: LEGACY_CREDENTIAL_NAME,
  });
  if (error || typeof data !== "string" || !data) {
    throw new Error("Hubstaff Admin connection is not configured.");
  }
  return data;
}

async function storeLegacyRefreshToken(value: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.rpc("set_service_credential", {
    p_name: LEGACY_CREDENTIAL_NAME,
    p_secret_value: value,
  });
  if (error) throw new Error("Unable to persist rotated Hubstaff credential");
}

async function refreshLegacyAccessToken(retry = true): Promise<string> {
  const refreshToken = await readLegacyRefreshToken();
  const response = await fetch(HUBSTAFF_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    if (retry && (payload["error"] === "invalid_grant" || payload["error"] === "invalid_token")) {
      return refreshLegacyAccessToken(false);
    }
    throw new Error(
      typeof payload["error"] === "string"
        ? `Hubstaff token exchange failed: ${payload["error"]}`
        : `Hubstaff token exchange returned HTTP ${response.status}`,
    );
  }
  const access = typeof payload["access_token"] === "string" ? payload["access_token"] : "";
  const rotated = typeof payload["refresh_token"] === "string" ? payload["refresh_token"] : "";
  if (!access || !rotated)
    throw new Error("Hubstaff token exchange returned an incomplete response");
  await storeLegacyRefreshToken(rotated);
  const expiresIn = Math.max(Number(payload["expires_in"] ?? 86_400), 60);
  cachedLegacyAccess = { token: access, expiresAt: Date.now() + (expiresIn - 60) * 1000 };
  return access;
}

async function legacyAccessToken() {
  if (cachedLegacyAccess && cachedLegacyAccess.expiresAt > Date.now()) {
    return cachedLegacyAccess.token;
  }
  return refreshLegacyAccessToken();
}

async function accessToken(userId: string, dependencies: HubstaffRequestDependencies) {
  const credential = await (dependencies.resolveUserCredential ?? readUserCredential)(userId);
  if (credential) return credential;
  return (dependencies.legacyAccessToken ?? legacyAccessToken)();
}

function safePath(path: string) {
  const value = path.trim();
  if (!/^\/v2\/[A-Za-z0-9_?&=.,%/-]{1,500}$/.test(value) || value.includes("..")) {
    throw new Error("Invalid Hubstaff API path");
  }
  return value;
}

export async function hubstaffAdminRequest(
  userId: string,
  input: {
    method?: string;
    path: string;
    body?: Record<string, unknown>;
  },
  dependencies: HubstaffRequestDependencies = {},
) {
  const path = safePath(input.path);
  const token = await accessToken(userId, dependencies);
  const method = (input.method ?? "GET").toUpperCase();
  if (!new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]).has(method)) {
    throw new Error("Unsupported Hubstaff API method");
  }
  const request = dependencies.fetch ?? globalThis.fetch;
  const response = await request(`${HUBSTAFF_API}${path}`, {
    method,
    headers: {
      accept: "application/json",
      authorization: `Bearer ${token}`,
      ...(method === "GET" ? {} : { "content-type": "application/json" }),
    },
    ...(method !== "GET" && input.body ? { body: JSON.stringify(input.body) } : {}),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const message =
      typeof payload["message"] === "string"
        ? payload["message"]
        : `Hubstaff returned HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

export async function hubstaffAdminIdentity(userId: string) {
  return hubstaffAdminRequest(userId, { path: "/v2/users/me" });
}

export async function listHubstaffOrganizations(userId: string) {
  return hubstaffAdminRequest(userId, { path: "/v2/organizations" });
}
