export type CredentialIdentity = {
  name: string;
  secret_type?: string;
  email_address?: string | null;
  username?: string | null;
  website?: string | null;
};

function websiteIdentity(value: string | null | undefined) {
  const text = value?.trim() ?? "";
  if (!text) return "";
  try {
    const url = new URL(text);
    return url.origin === "null" ? text : url.origin.toLowerCase();
  } catch {
    return text;
  }
}

/** Metadata matches are reuse candidates, never proof that secret values match or work. */
export function sameCredentialIdentity(a: CredentialIdentity, b: CredentialIdentity) {
  return (
    a.name.trim().toLowerCase() === b.name.trim().toLowerCase() &&
    (a.secret_type ?? "api_key") === (b.secret_type ?? "api_key") &&
    (a.email_address?.trim().toLowerCase() ?? "") ===
      (b.email_address?.trim().toLowerCase() ?? "") &&
    (a.username?.trim() ?? "") === (b.username?.trim() ?? "") &&
    websiteIdentity(a.website) === websiteIdentity(b.website)
  );
}

export function normalizeCredentialValue(value: string, type: string) {
  // Spaces may be part of a password. API key copy/paste whitespace is not.
  return type === "password" ? value : value.trim();
}
