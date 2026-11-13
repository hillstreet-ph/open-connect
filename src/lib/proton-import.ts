/** Server/import-boundary mapping. Returned login values are sensitive; never log or cache them. */
export type ProtonCsvRow = {
  type?: string;
  name?: string;
  url?: string;
  autofillUrls?: string;
  email?: string;
  username?: string;
  password?: string;
  note?: string;
  totp?: string;
  vault?: string;
};

export type ProtonLoginMapping =
  | { status: "review"; issues: string[] }
  | {
      status: "ready";
      value: {
        name: string;
        website: string;
        email_address: string;
        username: string;
        secret_value: string;
        totp_secret: string;
      };
    };

/** The existing vault generator supports SHA-1, six digits and a 30-second period only. */
export function protonTotpSeed(input: string): string | null {
  const value = input.trim();
  if (!value) return "";
  let secret = value;
  if (/^otpauth:/i.test(value)) {
    let uri: URL;
    try {
      uri = new URL(value);
    } catch {
      return null;
    }
    if (uri.protocol !== "otpauth:" || uri.hostname.toLowerCase() !== "totp") return null;
    const params = uri.searchParams;
    if (["secret", "algorithm", "digits", "period"].some((key) => params.getAll(key).length > 1))
      return null;
    if ((params.get("algorithm") || "SHA1").toUpperCase() !== "SHA1") return null;
    if ((params.get("digits") || "6") !== "6" || (params.get("period") || "30") !== "30")
      return null;
    secret = params.get("secret") || "";
  }
  const normalized = secret.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z2-7]{16,}=*$/.test(normalized)) return null;
  return normalized.replace(/=+$/, "");
}

/** Reject unsupported or lossy rows rather than silently discarding account data. */
export function mapProtonLogin(row: ProtonCsvRow): ProtonLoginMapping {
  const issues: string[] = [];
  if ((row.type || "").trim().toLowerCase() !== "login") issues.push("Unsupported item type");
  const name = (row.name || "").trim();
  if (!name || name.length > 120) issues.push("Title needs review");
  const email = (row.email || "").trim();
  const username = (row.username || "").trim();
  if ((!email && !username) || email.length > 320 || username.length > 320)
    issues.push("Account needs review");
  const rawUrl = (row.url || "").trim();
  if (!rawUrl || rawUrl.includes(",")) issues.push("Website needs review");
  try {
    const uri = new URL(rawUrl);
    if (
      uri.protocol !== "https:" ||
      uri.username ||
      uri.password ||
      uri.search ||
      uri.hash ||
      rawUrl.length > 2048
    )
      issues.push("Website needs review");
  } catch {
    issues.push("Website needs review");
  }
  const password = row.password || "";
  if (password.length < 4 || password.length > 16384) issues.push("Password needs review");
  const seed = protonTotpSeed(row.totp || "");
  if (seed === null) issues.push("Authenticator settings need review");
  // Notes and structured URLs may contain sensitive fields and cannot currently be preserved safely.
  if ((row.note || "").trim()) issues.push("Notes need review");
  if ((row.autofillUrls || "").trim()) issues.push("Structured websites need review");
  if ((row.vault || "").trim()) issues.push("Source vault needs review");
  if (issues.length) return { status: "review", issues: [...new Set(issues)] };
  return {
    status: "ready",
    value: {
      name,
      website: rawUrl,
      email_address: email,
      username,
      secret_value: password,
      totp_secret: seed || "",
    },
  };
}
