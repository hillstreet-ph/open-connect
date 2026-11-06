/**
 * Read-only summary of the Developer page for MCP clients (Claude, ChatGPT).
 *
 * Never includes secret material: no token hashes or values, no OAuth client
 * secret hashes, no webhook secret hashes, and no notification destinations
 * (webhook URLs can embed credentials). Writes that mint or reveal secrets stay
 * in the signed-in web UI, where the user sees the secret once.
 */
export type TokenRow = {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[] | null;
  access_profile: string | null;
  oauth_resource: string | null;
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
};
export type OAuthAppRow = {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  created_at: string;
  secret_rotated_at: string | null;
  revoked_at: string | null;
};
export type WebhookRow = { id: string; name: string; created_at: string };
export type ChannelRow = {
  id: string;
  kind: string;
  name: string;
  enabled: boolean;
  created_at: string;
};

const isGrant = (row: TokenRow) => Boolean(row.oauth_resource) || row.name.startsWith("OAuth: ");
const isActive = (row: TokenRow, now: number) =>
  !row.revoked_at && (!row.expires_at || Date.parse(row.expires_at) > now);

export function summarizeDeveloperAccess(
  input: {
    tokens: TokenRow[];
    oauthApps: OAuthAppRow[];
    webhooks: WebhookRow[];
    channels: ChannelRow[];
  },
  now = Date.now(),
) {
  const active = input.tokens.filter((row) => isActive(row, now));
  const grants = new Map<
    string,
    { app: string; sessions: number; scopes: string[]; last_used_at: string | null }
  >();
  for (const row of active.filter(isGrant)) {
    const app = row.name.replace(/^OAuth:\s*/, "") || "OAuth app";
    const entry = grants.get(app) ?? { app, sessions: 0, scopes: [], last_used_at: null };
    entry.sessions += 1;
    entry.scopes = [...new Set([...entry.scopes, ...(row.scopes ?? [])])];
    if (row.last_used_at && (!entry.last_used_at || row.last_used_at > entry.last_used_at))
      entry.last_used_at = row.last_used_at;
    grants.set(app, entry);
  }
  return {
    developer_page: "https://open-connect.site/integrations",
    personal_tokens: active
      .filter((row) => !isGrant(row))
      .map((row) => ({
        id: row.id,
        name: row.name,
        prefix: row.key_prefix,
        scopes: row.scopes ?? [],
        access_profile: row.access_profile,
        last_used_at: row.last_used_at,
        expires_at: row.expires_at,
        created_at: row.created_at,
      })),
    oauth_apps: input.oauthApps.map((row) => ({
      client_id: row.client_id,
      name: row.client_name,
      redirect_uris: row.redirect_uris,
      status: row.revoked_at ? "revoked" : "active",
      created_at: row.created_at,
      secret_rotated_at: row.secret_rotated_at,
    })),
    authorized_apps: [...grants.values()].sort((a, b) => a.app.localeCompare(b.app)),
    webhooks: input.webhooks.map((row) => ({
      id: row.id,
      name: row.name,
      created_at: row.created_at,
    })),
    notification_channels: input.channels.map((row) => ({
      id: row.id,
      kind: row.kind,
      name: row.name,
      enabled: row.enabled,
    })),
    secret_values_exposed: false,
    management:
      "Create, rotate, or revoke tokens, OAuth client secrets, and webhooks in the Developer page; secrets are shown once to the signed-in user.",
  };
}
