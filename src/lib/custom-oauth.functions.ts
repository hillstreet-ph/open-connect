import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { auth, discoverOAuthMetadata } from "@modelcontextprotocol/sdk/client/auth.js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { oauthProvider, type OAuthBundle } from "./custom-oauth.server";
import { publicFetch } from "./public-fetch.server";
import { normalizeConnectionSetup, type ConnectionSetupInput } from "./connection-setup";
import { normalizeRemoteMcpEndpoint } from "./remote-mcp";
const callback = "https://open-connect.site/custom-oauth-callback";
async function hash(value: string) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export const beginCustomOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (
      input: ConnectionSetupInput & {
        client_id?: string;
        client_secret?: string;
        issuer?: string;
        scope?: string;
      },
    ) => input,
  )
  .handler(async ({ data, context }) => {
    const setup = normalizeConnectionSetup(
      { ...data, api_key: "", auth_type: "none" },
      {
        provider: data.provider,
        display_name: data.display_name || "Custom MCP",
        oauth: false,
        scopes: [],
      },
    );
    if (data.connection_id) {
      const existing = await context.supabase
        .from("app_connections")
        .select("id")
        .eq("id", data.connection_id)
        .eq("user_id", context.userId)
        .eq("provider", data.provider)
        .single();
      if (existing.error || !existing.data) throw new Error("Owned reconnect target not found");
    }
    const state = crypto.randomUUID() + crypto.randomUUID();
    const bundle: OAuthBundle = { endpoint: setup.endpointUrl, transport: setup.transport };
    if (data.client_id) {
      if (!data.issuer)
        throw new Error("Provide the registered client's issuer URL to bind its credentials");
      const issuer = normalizeRemoteMcpEndpoint("custom_mcp", data.issuer);
      const metadata = await discoverOAuthMetadata(new URL(issuer), {}, publicFetch);
      if (!metadata) throw new Error("Issuer does not publish supported OAuth metadata");
      bundle.discovery = { authorizationServerUrl: issuer, authorizationServerMetadata: metadata };
      bundle.client = {
        client_id: data.client_id,
        issuer,
        ...(data.client_secret ? { client_secret: data.client_secret } : {}),
      };
    }
    let authorization = "";
    try {
      await auth(
        oauthProvider(bundle, state, callback, (url) => {
          normalizeRemoteMcpEndpoint("custom_mcp", url.href);
          authorization = url.href;
        }),
        {
          serverUrl: setup.endpointUrl,
          ...(data.scope ? { scope: data.scope } : {}),
          fetchFn: publicFetch,
        },
      );
    } catch {
      throw new Error(
        "OAuth discovery or client registration failed. Check the server's OAuth support; pre-registered clients need their issuer and client ID.",
      );
    }
    if (!authorization) throw new Error("The provider did not return an authorization URL");
    const db = context.supabase as SupabaseClient;
    const { data: secret, error: secretError } = await db.rpc("create_credential_secret", {
      p_name: `${setup.displayName} OAuth`,
      p_secret_type: "other",
      p_scopes: ["connections"],
      p_secret_value: JSON.stringify(bundle),
    });
    if (secretError || !secret?.id) throw new Error("Could not save the OAuth verifier securely");
    const { data: row, error } = await db
      .from("app_connections")
      .insert({
        user_id: context.userId,
        provider: setup.provider,
        display_name: setup.displayName,
        status: "pending",
        provider_account_id: `oauth-${crypto.randomUUID()}`,
        credential_reference: `credential://${setup.provider}/${secret.id}`,
        scopes: [],
        metadata: {
          source: "open-connect",
          mode: "custom_mcp",
          endpoint_url: setup.endpointUrl,
          transport: setup.transport,
          openapi: setup.openapi || null,
          icon_data: setup.iconData,
          auth_type: "oauth",
          account_label: setup.accountLabel,
          description: setup.description,
          oauth_replace_id: data.connection_id || null,
          oauth_client_id: bundle.client?.client_id || "",
          oauth_issuer: bundle.client?.issuer || "",
          oauth_state_hash: await hash(state),
          oauth_expires_at: Date.now() + 10 * 60000,
        },
      })
      .select("id")
      .single();
    if (error) {
      await db.rpc("delete_credential_secret", { p_id: secret.id });
      throw new Error("Could not save the pending OAuth connection");
    }
    return { id: row.id as string, authorization_url: authorization };
  });
export const finishCustomOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { code: string; state: string }) => input)
  .handler(async ({ data, context }) => {
    if (!data.code || !data.state) throw new Error("OAuth callback is incomplete");
    const db = context.supabase as SupabaseClient;
    const { data: row, error } = await db
      .from("app_connections")
      .select("id,provider,credential_reference,metadata")
      .eq("user_id", context.userId)
      .eq("status", "pending")
      .eq("metadata->>oauth_state_hash", await hash(data.state))
      .single();
    if (error || !row || row.metadata.oauth_expires_at < Date.now())
      throw new Error("OAuth request expired or belongs to another account");
    const { data: claimed, error: claimError } = await db
      .from("app_connections")
      .update({ metadata: { ...row.metadata, oauth_claimed: true } })
      .eq("id", row.id)
      .eq("user_id", context.userId)
      .is("metadata->>oauth_claimed", null)
      .select("id")
      .maybeSingle();
    if (claimError || !claimed) throw new Error("This OAuth callback has already been used");
    const secretId = String(row.credential_reference).split("/").pop()!;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await supabaseAdmin.rpc("resolve_connection_credential", {
      p_user_id: context.userId,
      p_credential_id: secretId,
    });
    if (result.error || typeof result.data !== "string")
      throw new Error("OAuth verifier unavailable");
    const bundle = JSON.parse(result.data) as OAuthBundle;
    try {
      const state = await auth(
        oauthProvider(bundle, data.state, callback, () => {
          throw new Error("Provider requested a new authorization");
        }),
        { serverUrl: bundle.endpoint, authorizationCode: data.code, fetchFn: publicFetch },
      );
      if (state !== "AUTHORIZED" || !bundle.tokens?.access_token)
        throw new Error("No access token");
    } catch {
      throw new Error(
        "OAuth exchange failed. Start a new authorization; provider errors and secrets were not exposed.",
      );
    }
    delete bundle.verifier;
    const stored = await db.rpc("update_credential_secret_value", {
      p_id: secretId,
      p_secret_value: JSON.stringify(bundle),
    });
    if (stored.error) throw new Error("Could not save OAuth tokens securely");
    let snapshot: unknown;
    let discoveryReady = true;
    try {
      if (bundle.transport === "openapi") {
        const { openApiOperations } = await import("./openapi-connector");
        const api = openApiOperations(row.metadata.openapi);
        snapshot = {
          server: { name: api.title },
          tools: api.tools,
          prompts: [],
          resources: [],
          checked_at: new Date().toISOString(),
          catalog_scope: "complete",
        };
      } else {
        const { fetchMcpSnapshot } = await import("./mcp-client.server");
        snapshot = await fetchMcpSnapshot(
          bundle.endpoint,
          { Authorization: `Bearer ${bundle.tokens!.access_token}` },
          bundle.transport,
        );
      }
    } catch {
      discoveryReady = false;
    }
    const scopes = bundle.tokens!.scope?.split(" ").filter(Boolean) || [];
    if (discoveryReady) {
      const { activateOAuthConnection } = await import("./oauth-activation.server");
      await activateOAuthConnection(db, context.userId, { ...row, scopes }, snapshot);
    } else {
      const updated = await db
        .from("app_connections")
        .update({
          status: "degraded",
          scopes,
          metadata: {
            ...row.metadata,
            oauth_state_hash: null,
            oauth_expires_at: null,
            oauth_claimed: true,
            discovery_error:
              "Authorization succeeded. Retry capability discovery before using tools.",
          },
        })
        .eq("id", row.id)
        .eq("user_id", context.userId);
      if (updated.error) throw new Error("Could not save authorization status");
    }
    return { ok: true, discovery_ready: discoveryReady };
  });
