const HUBSTAFF_API = "https://api.hubstaff.com";
const HUBSTAFF_TOKEN_ENDPOINT = "https://account.hubstaff.com/access_tokens";
const CREDENTIAL_NAME = "hubstaff_admin_refresh_token";

let cachedAccess: { token: string; expiresAt: number } | null = null;

export function hubstaffAdminConfig() {
  return { configured: true, endpoint: HUBSTAFF_API, credential: CREDENTIAL_NAME };
}

async function readRefreshToken() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("get_service_credential", {
    p_name: CREDENTIAL_NAME,
  });
  if (error || typeof data !== "string" || !data) {
    throw new Error("Hubstaff Admin refresh credential is not configured");
  }
  return data;
}

async function storeRefreshToken(value: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.rpc("set_service_credential", {
    p_name: CREDENTIAL_NAME,
    p_secret_value: value,
  });
  if (error) throw new Error("Unable to persist rotated Hubstaff credential");
}

async function refreshAccessToken(retry = true): Promise<string> {
  const refreshToken = await readRefreshToken();
  const response = await fetch(HUBSTAFF_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    if (retry && (payload["error"] === "invalid_grant" || payload["error"] === "invalid_token")) {
      return refreshAccessToken(false);
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
  await storeRefreshToken(rotated);
  const expiresIn = Math.max(Number(payload["expires_in"] ?? 86_400), 60);
  cachedAccess = { token: access, expiresAt: Date.now() + (expiresIn - 60) * 1000 };
  return access;
}

async function accessToken() {
  if (cachedAccess && cachedAccess.expiresAt > Date.now()) return cachedAccess.token;
  return refreshAccessToken();
}

function safePath(path: string) {
  const value = path.trim();
  if (!/^\/v2\/[A-Za-z0-9_?&=.,%/-]{1,500}$/.test(value) || value.includes("..")) {
    throw new Error("Invalid Hubstaff API path");
  }
  return value;
}

export async function hubstaffAdminRequest(input: {
  method?: string;
  path: string;
  body?: Record<string, unknown>;
}) {
  const path = safePath(input.path);
  const token = await accessToken();
  const method = (input.method ?? "GET").toUpperCase();
  if (!new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]).has(method)) {
    throw new Error("Unsupported Hubstaff API method");
  }
  const response = await fetch(`${HUBSTAFF_API}${path}`, {
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

export async function hubstaffAdminIdentity() {
  return hubstaffAdminRequest({ path: "/v2/users/me" });
}

export async function listHubstaffOrganizations() {
  return hubstaffAdminRequest({ path: "/v2/organizations" });
}
