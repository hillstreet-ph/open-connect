export const GITHUB_OAUTH_SCOPES = ["repo", "read:user", "workflow"] as const;

export function githubCallbackUrl(appUrl: string): string {
  return `${appUrl.replace(/\/$/, "")}/connections/oauth/callback`;
}

export function buildGitHubAuthorizationUrl(input: {
  clientId: string;
  appUrl: string;
  state: string;
}): string {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", githubCallbackUrl(input.appUrl));
  url.searchParams.set("scope", GITHUB_OAUTH_SCOPES.join(" "));
  url.searchParams.set("state", input.state);
  url.searchParams.set("allow_signup", "false");
  return url.toString();
}

export async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function oauthConfig(provider: string) {
  if (provider !== "github") {
    throw new Error("Official OAuth is not available for this provider yet.");
  }

  const clientId = process.env["GITHUB_CLIENT_ID"]?.trim();
  const clientSecret = process.env["GITHUB_CLIENT_SECRET"]?.trim();
  const appUrl = (process.env["VITE_APP_URL"] || "https://open-connect.site").trim();

  if (!clientId || !clientSecret) {
    throw new Error(
      "GitHub OAuth is not configured. Add GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET to the Cloudflare production environment.",
    );
  }

  return { clientId, clientSecret, appUrl };
}

export async function exchangeGitHubCode(input: {
  code: string;
  clientId: string;
  clientSecret: string;
  appUrl: string;
  send?: typeof fetch;
}) {
  const send = input.send ?? fetch;
  const tokenResponse = await send("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code: input.code,
      redirect_uri: githubCallbackUrl(input.appUrl),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!tokenResponse.ok) throw new Error(`GitHub token exchange failed (HTTP ${tokenResponse.status}).`);
  const tokenPayload = (await tokenResponse.json()) as {
    access_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };
  if (!tokenPayload.access_token) {
    throw new Error(tokenPayload.error_description || tokenPayload.error || "GitHub did not return an access token.");
  }

  const identityResponse = await send("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${tokenPayload.access_token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "Open-Connect",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!identityResponse.ok) {
    throw new Error(`GitHub identity verification failed (HTTP ${identityResponse.status}).`);
  }
  const identity = (await identityResponse.json()) as { id?: number; login?: string };
  if (!identity.id || !identity.login) throw new Error("GitHub identity response was incomplete.");

  return {
    accessToken: tokenPayload.access_token,
    scopes: (tokenPayload.scope || "").split(",").map((scope) => scope.trim()).filter(Boolean),
    accountId: String(identity.id),
    accountLogin: identity.login,
  };
}
