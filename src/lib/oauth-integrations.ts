import { isAcceptableRedirectUri } from "./oauth-redirect.ts";

export const MAX_INTEGRATION_REDIRECT_URIS = 10;

export type OAuthIntegration = {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  client_secret_prefix: string | null;
  created_at: string;
  secret_rotated_at: string | null;
  revoked_at: string | null;
};

/** Split a textarea (one URL per line, or comma-separated) into unique redirect URLs. */
export function parseRedirectUriList(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\n,]/)
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}

export function validateIntegrationInput(input: { name: unknown; redirect_uris: unknown }): {
  name: string;
  redirect_uris: string[];
} {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 120) throw new Error("Name must be 1 to 120 characters.");
  const uris = Array.isArray(input.redirect_uris)
    ? input.redirect_uris.filter((v): v is string => typeof v === "string")
    : [];
  if (uris.length < 1 || uris.length > MAX_INTEGRATION_REDIRECT_URIS)
    throw new Error(`Add 1 to ${MAX_INTEGRATION_REDIRECT_URIS} OAuth redirect URLs.`);
  const invalid = uris.find((uri) => !isAcceptableRedirectUri(uri));
  if (invalid)
    throw new Error(
      `Redirect URL must use HTTPS (or http loopback for desktop apps), without credentials or a fragment: ${invalid.slice(0, 120)}`,
    );
  return { name, redirect_uris: uris };
}
