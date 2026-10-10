type CredentialMetadata = {
  id: string;
  name: string;
  website: string | null;
  username: string | null;
  email_address: string | null;
  vault_secret_id: string | null;
  totp_vault_secret_id: string | null;
};

function secureOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function matchBrowserCredentials(
  records: CredentialMetadata[],
  originInput: unknown,
  accountInput?: unknown,
) {
  if (typeof originInput !== "string" || originInput.length > 500)
    throw new Error("Provide an HTTPS origin without a path, query, or fragment.");
  const origin = secureOrigin(originInput);
  if (!origin || ![origin, origin + "/"].includes(originInput))
    throw new Error("Provide an HTTPS origin without a path, query, or fragment.");
  if (
    accountInput !== undefined &&
    (typeof accountInput !== "string" || !accountInput.trim() || accountInput.length > 320)
  )
    throw new Error("Account must be a nonempty identifier of at most 320 characters.");
  const account = typeof accountInput === "string" ? accountInput.trim() : null;
  const candidates = records.filter((record) => {
    if (!record.vault_secret_id || !record.website || secureOrigin(record.website) !== origin)
      return false;
    if (!account) return true;
    // Email addresses ignore case; other usernames require an exact match.
    return [record.email_address, record.username].some((identifier) => {
      if (!identifier) return false;
      return identifier.includes("@") && account.includes("@")
        ? identifier.trim().toLowerCase() === account.toLowerCase()
        : identifier.trim() === account;
    });
  });
  const status =
    candidates.length === 0 ? "no_match" : candidates.length === 1 ? "matched" : "ambiguous";
  return {
    origin,
    status,
    matches: candidates.slice(0, 10).map((record) => ({
      credential_id: record.id,
      name: record.name,
      account: record.email_address || record.username || null,
      has_password: true,
      has_totp: Boolean(record.totp_vault_secret_id),
    })),
    match_count: candidates.length,
    selected_credential_id: candidates.length === 1 ? candidates[0]!.id : null,
    secret_values_exposed: false,
    codes_generated: false,
    secure_injection_available: false,
    sign_in_performed: false,
    next_action:
      status === "ambiguous"
        ? "Select the intended account; never choose the first credential arbitrarily."
        : "Use the browser host's secure authentication capability. This matcher supplies metadata only; it is not a password or TOTP injection bridge.",
  };
}
