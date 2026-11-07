import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Subscription sign-in (ChatGPT / Claude).
 *
 * Uses each provider's public OAuth client, so no server-side OAuth app
 * credentials are required:
 *  - Claude (Pro/Max): authorization-code + PKCE against claude.ai. After the
 *    user authorizes, Claude shows a one-time code at
 *    console.anthropic.com/oauth/code/callback which the user pastes back.
 *  - ChatGPT (Plus/Pro): device-code flow against auth.openai.com. The user
 *    enters a one-time code at auth.openai.com/codex/device (device-code
 *    authentication must be enabled in the ChatGPT security settings);
 *    Open-Connect polls until the authorization completes.
 *
 * The resulting tokens are stored in Credential Vault and linked to an
 * app_connections row exactly like the GitHub OAuth flow. Subscription
 * accounts are routed through the gateway with their saved access token.
 */
const SIGN_IN_PROVIDERS = {
  anthropic: {
    label: "Claude",
    flow: "code_paste",
    authorizeUrl: "https://claude.ai/oauth/authorize",
    tokenUrl: "https://console.anthropic.com/v1/oauth/token",
    profileUrl: "https://api.anthropic.com/v1/oauth/profile",
    clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
    scopes: ["user:profile", "user:inference"],
    redirectUri: "https://console.anthropic.com/oauth/code/callback",
  },
  openai: {
    label: "ChatGPT",
    flow: "device",
    usercodeUrl: "https://auth.openai.com/api/accounts/deviceauth/usercode",
    pollUrl: "https://auth.openai.com/api/accounts/deviceauth/token",
    tokenUrl: "https://auth.openai.com/oauth/token",
    clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
    verificationUrl: "https://auth.openai.com/codex/device",
    redirectUri: "https://auth.openai.com/deviceauth/callback",
  },
} as const;

type SignInProvider = keyof typeof SIGN_IN_PROVIDERS;
type SignInConfig = (typeof SIGN_IN_PROVIDERS)[SignInProvider];

function signInConfig(provider: string): SignInConfig | null {
  return Object.prototype.hasOwnProperty.call(SIGN_IN_PROVIDERS, provider)
    ? SIGN_IN_PROVIDERS[provider as SignInProvider]
    : null;
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64Url(buffer: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64Url(digest);
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const part = token.split(".")[1] ?? "";
  const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function upsertPendingRow(
  context: { userId: string; supabase: SupabaseClient },
  provider: SignInProvider,
  config: SignInConfig,
  metadata: Record<string, unknown>,
) {
  const record = {
    user_id: context.userId,
    provider,
    display_name: `${config.label} subscription`,
    status: "pending",
    scopes: [] as string[],
    provider_account_id: null,
    metadata,
  };
  const { data: existing, error: existingError } = await context.supabase
    .from("app_connections")
    .select("id")
    .eq("user_id", context.userId)
    .eq("provider", provider)
    .eq("status", "pending")
    .is("provider_account_id", null)
    .contains("metadata", { mode: "oauth_subscription" })
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  const query = existing?.id
    ? context.supabase.from("app_connections").update(record).eq("id", existing.id)
    : context.supabase.from("app_connections").insert({ ...record, credential_reference: null });
  const { error } = await query.select("id").single();
  if (error) throw new Error(error.message);
}

async function findPendingRow(
  context: { userId: string; supabase: SupabaseClient },
  provider: SignInProvider,
) {
  const { data: pending, error } = await context.supabase
    .from("app_connections")
    .select("id,metadata,credential_reference")
    .eq("user_id", context.userId)
    .eq("provider", provider)
    .eq("status", "pending")
    .is("provider_account_id", null)
    .contains("metadata", { mode: "oauth_subscription" })
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (pending ?? null) as {
    id: string;
    metadata: Record<string, unknown> | null;
    credential_reference: string | null;
  } | null;
}

async function storeSubscriptionAccount(
  context: { userId: string; supabase: SupabaseClient },
  provider: SignInProvider,
  config: SignInConfig,
  pending: NonNullable<Awaited<ReturnType<typeof findPendingRow>>>,
  verified: {
    accessToken: string;
    refreshToken: string | null;
    identity: { id: string; email: string | null; name: string | null };
  },
) {
  const scopes =
    config.flow === "code_paste"
      ? [...config.scopes]
      : ["openid", "profile", "email", "offline_access"];
  const { data: matching, error: matchError } = await context.supabase
    .from("app_connections")
    .select("id,provider_account_id,credential_reference")
    .eq("user_id", context.userId)
    .eq("provider", provider)
    .eq("provider_account_id", verified.identity.id)
    .maybeSingle();
  if (matchError) throw new Error("Could not verify the existing provider account.");
  const targetId =
    matching?.id && matching.id !== pending.id ? matching.id : (matching?.id ?? pending.id);

  const { data: secret, error: secretError } = await context.supabase.rpc(
    "create_credential_secret",
    {
      p_name: `${config.label} subscription · ${verified.identity.email ?? verified.identity.id}`,
      p_secret_type: "oauth_token",
      p_scopes: ["connections"],
      p_secret_value: JSON.stringify({
        version: 1,
        auth_type: "oauth",
        credential: verified.accessToken,
        refresh_token: verified.refreshToken,
      }),
    },
  );
  if (secretError) throw new Error(secretError.message);
  const secretId = String((secret as { id?: string } | null)?.id ?? "");
  if (!secretId) throw new Error("Credential Vault did not return a reference.");

  const { data: connected, error: updateError } = await context.supabase
    .from("app_connections")
    .update({
      status: "connected",
      scopes,
      credential_reference: `credential://${provider}/${secretId}`,
      provider_account_id: verified.identity.id,
      metadata: {
        source: "open-connect",
        mode: "oauth_subscription",
        subscription: true,
        account_email: verified.identity.email,
        account_label: verified.identity.name ?? config.label,
        validation: { verified: true, checked_at: new Date().toISOString() },
        full_scopes: false,
      },
    })
    .eq("id", targetId)
    .eq("user_id", context.userId)
    .select("id,provider,display_name,status,scopes,provider_account_id,created_at")
    .single();
  if (updateError) {
    await context.supabase.rpc("delete_credential_secret", { p_id: secretId });
    throw new Error(updateError.message);
  }

  if (targetId !== pending.id) {
    await context.supabase
      .from("app_connections")
      .delete()
      .eq("id", pending.id)
      .eq("user_id", context.userId)
      .eq("status", "pending");
  }
  const oldSecretId = matching?.credential_reference?.match(
    /^credential:\/\/[^/]+\/([0-9a-f-]{36})$/i,
  )?.[1];
  if (oldSecretId && oldSecretId !== secretId) {
    await context.supabase.rpc("delete_credential_secret", { p_id: oldSecretId });
  }
  return connected;
}

export const startAiProviderSignIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { provider?: string }) => ({
    provider: (input?.provider ?? "").trim().toLowerCase(),
  }))
  .handler(async ({ data, context }) => {
    const provider = data.provider as SignInProvider;
    const config = signInConfig(provider);
    if (!config) {
      throw new Error("Subscription sign-in is available for ChatGPT and Claude only.");
    }

    if (config.flow === "code_paste") {
      const verifier = base64Url(crypto.getRandomValues(new Uint8Array(48)).buffer as ArrayBuffer);
      const challenge = await sha256Base64Url(verifier);
      const state = `${provider}:${crypto.randomUUID()}${crypto.randomUUID()}`;
      const stateHash = await sha256Hex(state);
      const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
      await upsertPendingRow(context, provider, config, {
        source: "open-connect",
        mode: "oauth_subscription",
        subscription: true,
        authorization_required: true,
        requested_scopes: [...config.scopes],
        oauth_state_hash: stateHash,
        oauth_state_expires_at: expiresAt,
        pkce_verifier: verifier,
        pkce_challenge: challenge,
        full_scopes: false,
      });
      const url = new URL(config.authorizeUrl);
      url.searchParams.set("client_id", config.clientId);
      url.searchParams.set("redirect_uri", config.redirectUri);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", config.scopes.join(" "));
      url.searchParams.set("state", state);
      url.searchParams.set("code_challenge", challenge);
      url.searchParams.set("code_challenge_method", "S256");
      return {
        authorization_url: url.toString(),
        provider,
        mode: config.flow,
        user_code: null,
        state,
      };
    }

    // Device-code flow (ChatGPT).
    const response = await fetch(config.usercodeUrl, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: config.clientId }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(
        `ChatGPT device sign-in could not start (HTTP ${response.status}). Enable device-code authentication in your ChatGPT security settings and try again.`,
      );
    }
    const payload = (await response.json()) as {
      device_auth_id?: string;
      user_code?: string;
      usercode?: string;
      interval?: number | string;
    };
    const deviceAuthId = payload.device_auth_id?.trim() ?? "";
    const userCode = (payload.user_code ?? payload.usercode ?? "").trim();
    if (!deviceAuthId || !userCode) {
      throw new Error("ChatGPT did not return a device code.");
    }
    await upsertPendingRow(context, provider, config, {
      source: "open-connect",
      mode: "oauth_subscription",
      subscription: true,
      authorization_required: true,
      requested_scopes: ["openid", "profile", "email", "offline_access"],
      device_auth_id: deviceAuthId,
      device_user_code: userCode,
      device_expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      full_scopes: false,
    });
    return {
      authorization_url: config.verificationUrl,
      provider,
      mode: config.flow,
      user_code: userCode,
      state: "",
    };
  });

export const completeAiProviderSignIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { provider?: string; code?: string; state?: string }) => ({
    provider: (input?.provider ?? "").trim().toLowerCase(),
    code: (input?.code ?? "").trim(),
    state: (input?.state ?? "").trim(),
  }))
  .handler(async ({ data, context }) => {
    const provider = data.provider as SignInProvider;
    const config = signInConfig(provider);
    if (!config) {
      throw new Error("Subscription sign-in is available for ChatGPT and Claude only.");
    }
    const pending = await findPendingRow(context, provider);
    if (!pending) throw new Error("No matching authorization request was found. Start again.");
    const metadata = (pending.metadata ?? {}) as Record<string, unknown>;

    if (config.flow === "code_paste") {
      if (!data.code || !data.state) {
        throw new Error("Paste the one-time code Claude showed after authorization.");
      }
      if (!data.state.startsWith(`${provider}:`)) {
        throw new Error("The authorization response did not match the requested provider.");
      }
      const expectedHash = String(metadata["oauth_state_hash"] ?? "");
      const expiresAt = Date.parse(String(metadata["oauth_state_expires_at"] ?? ""));
      const actualHash = await sha256Hex(data.state);
      if (
        !expectedHash ||
        actualHash !== expectedHash ||
        !Number.isFinite(expiresAt) ||
        expiresAt < Date.now()
      ) {
        throw new Error(
          "The authorization request expired or failed state verification. Start again.",
        );
      }
      const verifier = String(metadata["pkce_verifier"] ?? "");
      if (!verifier) {
        throw new Error("The authorization request expired. Start again.");
      }
      const response = await fetch(config.tokenUrl, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          client_id: config.clientId,
          code: data.code,
          code_verifier: verifier,
          redirect_uri: config.redirectUri,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        throw new Error(
          `Claude token exchange failed (HTTP ${response.status}). Check the one-time code and try again.`,
        );
      }
      const payload = (await response.json()) as {
        access_token?: string;
        refresh_token?: string;
        error?: string;
        error_description?: string;
      };
      if (!payload.access_token) {
        throw new Error(
          payload.error_description || payload.error || "Claude did not return an access token.",
        );
      }
      let identity = { id: "", email: null as string | null, name: null as string | null };
      try {
        const profile = await fetch(config.profileUrl, {
          headers: { Accept: "application/json", Authorization: `Bearer ${payload.access_token}` },
          cache: "no-store",
          signal: AbortSignal.timeout(12_000),
        });
        if (profile.ok) {
          const userinfo = (await profile.json()) as {
            sub?: string;
            email?: string;
            name?: string;
          };
          identity = {
            id: userinfo.sub ?? "",
            email: userinfo.email ?? null,
            name: userinfo.name ?? null,
          };
        }
      } catch {
        // Identity is optional; a stable reference is enough for the account row.
      }
      if (!identity.id) identity.id = crypto.randomUUID();
      return storeSubscriptionAccount(context, provider, config, pending, {
        accessToken: payload.access_token,
        refreshToken: payload.refresh_token ?? null,
        identity,
      });
    }

    // Device-code flow (ChatGPT): a single poll per call; pending keeps the UI waiting.
    const deviceAuthId = String(metadata["device_auth_id"] ?? "");
    const userCode = String(metadata["device_user_code"] ?? "");
    if (!deviceAuthId || !userCode) {
      throw new Error("Start ChatGPT device sign-in again.");
    }
    const poll = await fetch(config.pollUrl, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ device_auth_id: deviceAuthId, user_code: userCode }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (poll.status === 403 || poll.status === 404) {
      return { status: "pending" as const };
    }
    if (!poll.ok) {
      throw new Error(`ChatGPT device sign-in failed (HTTP ${poll.status}).`);
    }
    const granted = (await poll.json()) as { authorization_code?: string; code_verifier?: string };
    if (!granted.authorization_code || !granted.code_verifier) {
      return { status: "pending" as const };
    }
    const tokenResponse = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: config.clientId,
        code: granted.authorization_code,
        code_verifier: granted.code_verifier,
        redirect_uri: config.redirectUri,
      }).toString(),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!tokenResponse.ok) {
      throw new Error(`ChatGPT token exchange failed (HTTP ${tokenResponse.status}).`);
    }
    const payload = (await tokenResponse.json()) as {
      access_token?: string;
      refresh_token?: string;
      id_token?: string;
      error?: string;
      error_description?: string;
    };
    if (!payload.access_token) {
      throw new Error(
        payload.error_description || payload.error || "ChatGPT did not return an access token.",
      );
    }
    let identity = { id: "", email: null as string | null, name: null as string | null };
    if (payload.id_token) {
      const claims = decodeJwtPayload(payload.id_token);
      identity = {
        id: typeof claims["sub"] === "string" ? claims["sub"] : "",
        email: typeof claims["email"] === "string" ? claims["email"] : null,
        name: typeof claims["name"] === "string" ? claims["name"] : null,
      };
    }
    if (!identity.id) identity.id = crypto.randomUUID();
    return storeSubscriptionAccount(context, provider, config, pending, {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token ?? null,
      identity,
    });
  });
