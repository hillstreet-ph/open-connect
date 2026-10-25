import {
  auth,
  type OAuthClientProvider,
  type OAuthDiscoveryState,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { publicFetch } from "./public-fetch.server.ts";
export type OAuthBundle = {
  endpoint: string;
  transport: "http" | "sse" | "openapi";
  verifier?: string;
  client?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  expires_at?: number;
  discovery?: OAuthDiscoveryState;
};
export function oauthProvider(
  bundle: OAuthBundle,
  state: string,
  redirectUrl: string,
  redirect: (url: URL) => void,
): OAuthClientProvider {
  return {
    redirectUrl,
    clientMetadata: {
      client_name: "Open-Connect",
      redirect_uris: [redirectUrl],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: bundle.client?.client_secret ? "client_secret_post" : "none",
    },
    state: () => state,
    clientInformation: () => bundle.client,
    saveClientInformation: (value) => {
      bundle.client = value;
    },
    tokens: () => bundle.tokens,
    saveTokens: (value) => {
      bundle.tokens = value;
      bundle.expires_at = Date.now() + (value.expires_in ?? 300) * 1000;
    },
    redirectToAuthorization: redirect,
    saveCodeVerifier: (value) => {
      bundle.verifier = value;
    },
    codeVerifier: () => {
      if (!bundle.verifier) throw new Error("OAuth verifier expired; reconnect");
      return bundle.verifier;
    },
    saveDiscoveryState: (value) => {
      bundle.discovery = value;
    },
    discoveryState: () => bundle.discovery,
    invalidateCredentials: (scope) => {
      if (scope === "tokens" || scope === "all") {
        delete bundle.tokens;
        delete bundle.expires_at;
      }
      if (scope === "client" || scope === "all") delete bundle.client;
      if (scope === "discovery" || scope === "all") delete bundle.discovery;
    },
  };
}
export async function oauthAccessToken(
  userId: string,
  connectionId: string,
  reference: string,
): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const id = reference.split("/").pop()!;
  const read = async () => {
    const { data, error } = await supabaseAdmin.rpc("resolve_connection_credential", {
      p_user_id: userId,
      p_credential_id: id,
    });
    if (error || typeof data !== "string")
      throw new Error("OAuth credential unavailable; reconnect");
    return data;
  };
  const original = await read();
  const bundle = JSON.parse(original) as OAuthBundle;
  if (bundle.tokens?.access_token && (bundle.expires_at ?? 0) > Date.now() + 30000)
    return bundle.tokens.access_token;
  const callback = "https://open-connect.site/custom-oauth-callback";
  try {
    const result = await auth(
      oauthProvider(bundle, "", callback, () => {
        throw new Error("OAuth reauthorization required");
      }),
      { serverUrl: bundle.endpoint, fetchFn: publicFetch },
    );
    if (result !== "AUTHORIZED" || !bundle.tokens?.access_token)
      throw new Error("OAuth reauthorization required");
    const { data, error } = await supabaseAdmin.rpc(
      "rotate_connection_oauth_bundle" as never,
      {
        p_user_id: userId,
        p_connection_id: connectionId,
        p_expected: original,
        p_value: JSON.stringify(bundle),
      } as never,
    );
    if (error) throw new Error("Token refresh could not be saved");
    if (data !== true) {
      const fresh = JSON.parse(await read()) as OAuthBundle;
      if (!fresh.tokens?.access_token) throw new Error("OAuth reauthorization required");
      return fresh.tokens.access_token;
    }
    return bundle.tokens.access_token;
  } catch {
    const latest = JSON.parse(await read()) as OAuthBundle;
    if (latest.tokens?.access_token && (latest.expires_at ?? 0) > Date.now() + 30000)
      return latest.tokens.access_token;
    throw new Error("OAuth token expired or authorization changed. Reconnect this account.");
  }
}
