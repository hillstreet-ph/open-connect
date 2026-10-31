/**
 * Connected-account presentation helpers.
 *
 * Supabase Auth exposes linked sign-in identities on the user object. This module
 * turns that raw list into per-provider status for the settings UI and parses the
 * provider redirect errors, without any DOM or network access.
 */

export type ConnectableProvider = "google" | "github";

export type ProviderMeta = {
  id: ConnectableProvider;
  label: string;
  description: string;
};

/** Providers this app offers to link. Order is the display order. */
export const CONNECTABLE_PROVIDERS: readonly ProviderMeta[] = [
  {
    id: "google",
    label: "Google",
    description: "Sign in with the Google account you already use.",
  },
  {
    id: "github",
    label: "GitHub",
    description: "Sign in with the GitHub account you already use.",
  },
];

export type IdentityLike = {
  identity_id: string;
  provider: string;
  identity_data?: Record<string, unknown> | null;
};

/** The subset of an identity needed to read a display label. */
export type LabeledIdentity = {
  provider: string;
  identity_data?: Record<string, unknown> | null;
};

export type ConnectedAccount<T extends IdentityLike = IdentityLike> = {
  provider: ConnectableProvider;
  label: string;
  description: string;
  connected: boolean;
  /** Email or handle shown next to the provider, when known. */
  accountLabel: string | null;
  /** False for the only remaining sign-in method, which Supabase refuses to unlink. */
  canDisconnect: boolean;
  identity: T | null;
};

export function connectableProviderIds(): ConnectableProvider[] {
  return CONNECTABLE_PROVIDERS.map((provider) => provider.id);
}

export function providerLabel(provider: string): string {
  return CONNECTABLE_PROVIDERS.find((candidate) => candidate.id === provider)?.label ?? provider;
}

function identityText(identity: LabeledIdentity, keys: string[]): string | null {
  const data = identity.identity_data;
  if (!data) return null;
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
}

/** Best-effort label for a linked identity: email, then handle, then username. */
export function identityAccountLabel(identity: LabeledIdentity): string | null {
  return identityText(identity, ["email", "user_name", "preferred_username", "login", "name"]);
}

/**
 * Whether the linked provider really is attached to the account.
 *
 * The `linked` redirect parameter is only a hint: a stale or shared callback URL
 * can carry it without any link happening, so success is confirmed against the
 * identities the auth client actually reports.
 */
export function isProviderLinked(
  identities: readonly LabeledIdentity[] | null | undefined,
  provider: string,
): boolean {
  return (identities ?? []).some((identity) => identity.provider === provider);
}

/**
 * Status for every connectable provider. A provider is "connected" when the user
 * already has an identity for it; the last remaining identity cannot be unlinked.
 */
export function buildConnectedAccounts<T extends IdentityLike>(
  identities: T[] | null | undefined,
): ConnectedAccount<T>[] {
  const list = identities ?? [];
  const unlinkable = list.length > 1;
  return CONNECTABLE_PROVIDERS.map((provider) => {
    const identity = list.find((candidate) => candidate.provider === provider.id) ?? null;
    return {
      provider: provider.id,
      label: provider.label,
      description: provider.description,
      connected: identity !== null,
      accountLabel: identity ? identityAccountLabel(identity) : null,
      canDisconnect: identity !== null && unlinkable,
      identity,
    };
  });
}

export type AuthCallbackError = {
  code: string;
  description: string;
};

function readParam(params: URLSearchParams, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = params.get(key);
    if (value) return value;
  }
  return null;
}

/**
 * Reads a provider redirect error from an absolute or relative callback URL.
 * GoTrue reports these in the query string (PKCE) or the fragment (implicit).
 */
export function parseAuthCallbackError(url: string): AuthCallbackError | null {
  let parsed: URL;
  try {
    parsed = new URL(url, "https://open-connect.local");
  } catch {
    return null;
  }
  const sources = [parsed.searchParams, new URLSearchParams(parsed.hash.replace(/^#/, ""))];
  for (const params of sources) {
    const code = readParam(params, "error_code", "error");
    const description = readParam(params, "error_description");
    if (code || description) {
      return {
        code: code ?? "unknown_error",
        description: description ?? "The provider did not complete the connection.",
      };
    }
  }
  return null;
}

/** Plain-language explanation for a provider linking failure. */
export function describeLinkError(error: AuthCallbackError): string {
  switch (error.code) {
    case "identity_already_exists":
      return "That account is already connected to a different Open-Connect account. Sign in with it directly, or disconnect it there first.";
    case "identity_not_found":
      return "That connection no longer exists. Refresh and try again.";
    case "single_identity_not_deletable":
      return "You cannot disconnect your only sign-in method. Connect another one first.";
    case "email_exists":
      return "An account with that email already exists. Sign in with it instead of connecting it.";
    case "validation_failed":
    case "unsupported_provider":
      return "This provider is not enabled for the platform. Try another sign-in method.";
    case "access_denied":
      return "The provider cancelled the request before it finished.";
    default:
      return error.description;
  }
}

/** Explain immediate SDK errors using the same messages as redirect failures. */
export function describeAccountError(error: unknown, fallback: string): string {
  if (!error || typeof error !== "object") return fallback;
  const candidate = error as { code?: unknown; message?: unknown };
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const description = typeof candidate.message === "string" ? candidate.message : fallback;
  return describeLinkError({ code, description });
}

/** Remove a handled provider error without losing the requested sign-in destination. */
export function clearAuthCallbackError(url: string): string {
  const parsed = new URL(url);
  for (const key of ["error", "error_code", "error_description"]) parsed.searchParams.delete(key);
  const hash = new URLSearchParams(parsed.hash.slice(1));
  if (["error", "error_code", "error_description"].some((key) => hash.has(key))) {
    for (const key of ["error", "error_code", "error_description"]) hash.delete(key);
    const remaining = hash.toString();
    parsed.hash = remaining ? `#${remaining}` : "";
  }
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
