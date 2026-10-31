import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Subscription sign-in (ChatGPT / Claude).
 *
 * Full OAuth 2.0 authorization-code flow against the official provider
 * identity servers. The user signs in with their ChatGPT or Claude
 * subscription account; the resulting tokens are stored in Credential Vault
 * and linked to an app_connections row exactly like the GitHub OAuth flow.
 *
 * Requires the provider OAuth app credentials:
 *   OPENAI_CLIENT_ID / OPENAI_CLIENT_SECRET
 *   ANTHROPIC_CLIENT_ID / ANTHROPIC_CLIENT_SECRET
 */
const SIGN_IN_PROVIDERS = {
  openai: {
    label: "ChatGPT",
    authorizeUrl: "https://auth.openai.com/oauth/authorize",
    tokenUrl: "https://auth.openai.com/oauth/token",
    userinfoUrl: "https://auth.openai.com/oauth/userinfo",
    clientIdEnv: "OPENAI_CLIENT_ID",
    clientSecretEnv: "OPENAI_CLIENT_SECRET",
    scopes: ["openid", "profile", "email", "offline_access"],
  },
  anthropic: {
    label: "Claude",
    authorizeUrl: "https://console.anthropic.com/oauth/authorize",
    tokenUrl: "https://console.anthropic.com/oauth/token",
    userinfoUrl: "https://console.anthropic.com/oauth/userinfo",
    clientIdEnv: "ANTHROPIC_CLIENT_ID",
    clientSecretEnv: "ANTHROPIC_CLIENT_SECRET",
    scopes: ["openid", "profile", "email", "offline_access"],
  },
} as const;

type SignInProvider = keyof typeof SIGN_IN_PROVIDERS;
type SignInConfig = (typeof SIGN_IN_PROVIDERS)[SignInProvider];

const CALLBACK_PATH = "/connections/oauth/callback";

function signInConfig(provider: string): SignInConfig | null {
  return Object.prototype.hasOwnProperty.call(SIGN_IN_PROVIDERS, provider)
    ? SIGN_IN_PROVIDERS[provider as SignInProvider]
    : null;
}

function signInCredentials(config: SignInConfig) {
  const clientId = process.env[config.clientIdEnv]?.trim();
  const clientSecret = process.env[config.clientSecretEnv]?.trim();
  const appUrl = (process.env["VITE_APP_URL"] || "https://open-connect.site")
    .trim()
    .replace(/\/$/, "");
  if (!clientId || !clientSecret) {
    throw new Error(
      `${config.label} subscription sign-in is not configured yet. Register the OAuth app at the provider, then add ${config.clientIdEnv} and ${config.clientSecretEnv} to the production environment.`,
    );
  }
  return { clientId, clientSecret, appUrl };
}

function signInCallbackUrl(appUrl: string): string {
  return `${appUrl}${CALLBACK_PATH}`;
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
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

async function exchangeSubscriptionCode(input: {
  config: SignInConfig;
  code: string;
  credentials: { clientId: string; clientSecret: string; appUrl: string };
}): Promise<{
  accessToken: string;
  refreshToken: string | null;
  identity: { id: string; email: string | null; name: string | null };
}> {
  const tokenResponse = await fetch(input.config.tokenUrl, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: input.credentials.clientId,
      client_secret: input.credentials.clientSecret,
      code: input.code,
      redirect_uri: signInCallbackUrl(input.credentials.appUrl),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!tokenResponse.ok) {
    throw new Error(`${input.config.label} token exchange failed (HTTP ${tokenResponse.status}).`);
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
      payload.error_description ||
        payload.error ||
        `${input.config.label} did not return an access token.`,
    );
  }

  let id = "";
  let email: string | null = null;
  let name: string | null = null;
  try {
    const userinfoResponse = await fetch(input.config.userinfoUrl, {
      headers: { Accept: "application/json", Authorization: `Bearer ${payload.access_token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (userinfoResponse.ok) {
      const userinfo = (await userinfoResponse.json()) as {
        sub?: string;
        email?: string;
        name?: string;
      };
      id = userinfo.sub ?? "";
      email = userinfo.email ?? null;
      name = userinfo.name ?? null;
    }
  } catch {
    // Identity falls back to the ID token claims below.
  }
  if (!id && payload.id_token) {
    const claims = decodeJwtPayload(payload.id_token);
    id = typeof claims["sub"] === "string" ? claims["sub"] : "";
    email = typeof claims["email"] === "string" ? claims["email"] : email;
    name = typeof claims["name"] === "string" ? claims["name"] : name;
  }
  if (!id) id = crypto.randomUUID();

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? null,
    identity: { id, email, name },
  };
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
    const credentials = signInCredentials(config);

    const nonce = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    const state = `${provider}:${nonce}`;
    const stateHash = await sha256Hex(state);
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();

    const record = {
      user_id: context.userId,
      provider,
      display_name: `${config.label} subscription`,
      status: "pending",
      scopes: [] as string[],
      provider_account_id: null,
      metadata: {
        source: "open-connect",
        mode: "oauth_subscription",
        subscription: true,
        authorization_required: true,
        requested_scopes: [...config.scopes],
        oauth_state_hash: stateHash,
        oauth_state_expires_at: expiresAt,
        full_scopes: false,
      },
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

    const url = new URL(config.authorizeUrl);
    url.searchParams.set("client_id", credentials.clientId);
    url.searchParams.set("redirect_uri", signInCallbackUrl(credentials.appUrl));
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", config.scopes.join(" "));
    url.searchParams.set("state", state);
    return { authorization_url: url.toString(), provider };
  });

export const completeAiProviderSignIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { provider?: string; code?: string; state?: string }) => ({
    provider: (input?.provider ?? "").trim().toLowerCase(),
    code: (input?.code ?? "").trim(),
    state: (input?.state ?? "").trim(),
  }))
  .handler(async ({ data, context }) => {
    if (!data.code || !data.state) throw new Error("The provider callback is incomplete.");
    const provider = data.provider as SignInProvider;
    const config = signInConfig(provider);
    if (!config) throw new Error("Subscription sign-in is available for ChatGPT and Claude only.");
    if (!data.state.startsWith(`${provider}:`)) {
      throw new Error("The authorization response did not match the requested provider.");
    }
    const credentials = signInCredentials(config);

    const { data: pending, error: pendingError } = await context.supabase
      .from("app_connections")
      .select("id,metadata,credential_reference")
      .eq("user_id", context.userId)
      .eq("provider", provider)
      .eq("status", "pending")
      .is("provider_account_id", null)
      .contains("metadata", { mode: "oauth_subscription" })
      .maybeSingle();
    if (pendingError) throw new Error(pendingError.message);
    if (!pending) throw new Error("No matching authorization request was found.");

    const metadata = (pending.metadata ?? {}) as Record<string, unknown>;
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

    const verified = await exchangeSubscriptionCode({
      config,
      code: data.code,
      credentials,
    });

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
        scopes: [...config.scopes],
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
  });
