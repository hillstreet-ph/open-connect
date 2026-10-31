import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Subscription sign-in (ChatGPT / Claude) entry points.
 *
 * Opens the official provider OAuth authorize URL so users can connect their
 * ChatGPT or Claude subscription instead of an API key. Requires the OAuth app
 * client credentials to be registered at the provider and configured as
 * environment variables.
 */
const SIGN_IN_PROVIDERS = {
  openai: {
    authorizeUrl: "https://auth.openai.com/oauth/authorize",
    clientIdEnv: "OPENAI_CLIENT_ID",
    scopes: ["openid", "profile", "email", "offline_access"],
    label: "ChatGPT",
  },
  anthropic: {
    authorizeUrl: "https://console.anthropic.com/oauth/authorize",
    clientIdEnv: "ANTHROPIC_CLIENT_ID",
    scopes: ["openid", "profile", "email"],
    label: "Claude",
  },
} as const;

type SignInProvider = keyof typeof SIGN_IN_PROVIDERS;

export const startAiProviderSignIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { provider?: string }) => ({
    provider: (input?.provider ?? "").trim().toLowerCase(),
  }))
  .handler(async ({ data }) => {
    const provider = data.provider as SignInProvider;
    const config = Object.prototype.hasOwnProperty.call(SIGN_IN_PROVIDERS, provider)
      ? SIGN_IN_PROVIDERS[provider as SignInProvider]
      : undefined;
    if (!config) {
      throw new Error("Subscription sign-in is available for ChatGPT and Claude only.");
    }
    const clientId = process.env[config.clientIdEnv]?.trim();
    if (!clientId) {
      throw new Error(
        `${config.label} subscription sign-in is not configured yet. Register the OAuth app at the provider and add ${config.clientIdEnv} to the production environment.`,
      );
    }
    const appUrl = (process.env["VITE_APP_URL"] || "https://open-connect.site")
      .trim()
      .replace(/\/$/, "");
    const url = new URL(config.authorizeUrl);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", `${appUrl}/connections/oauth/callback`);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", config.scopes.join(" "));
    url.searchParams.set("state", crypto.randomUUID());
    return { authorization_url: url.toString(), provider };
  });
