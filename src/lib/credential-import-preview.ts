/** Produces a secret-free preview; never persist or log raw CSV. */
export type CredentialPreview = {
  row: number;
  origin: string | null;
  account: string;
  kind: "password" | "api_key" | "unknown";
  status: "ready" | "review";
  issues: string[];
};

export const CREDENTIAL_IMPORT_MAX_BYTES = 10_000_000;
const MAX_ROWS = 20_000;
const MAX_CELL = 16_384;
const normalize = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");

function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let closedQuote = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"') {
      if (quoted && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted || (cell.length === 0 && !closedQuote)) {
        quoted = !quoted;
        if (!quoted) closedQuote = true;
      } else {
        throw new Error("Invalid CSV quote");
      }
    } else if (ch === "," && !quoted) {
      row.push(cell);
      cell = "";
      closedQuote = false;
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      closedQuote = false;
      if (rows.length > MAX_ROWS + 1) throw new Error("Too many rows");
    } else {
      if (closedQuote && !quoted) throw new Error("Invalid CSV trailing text");
      cell += ch;
    }
    if (cell.length > MAX_CELL) throw new Error("Cell too long");
  }
  if (quoted) throw new Error("Unclosed CSV quote");
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  if (rows.length > MAX_ROWS + 1) throw new Error("Too many rows");
  return rows;
}

export type ExistingCredentialIdentity = {
  website: string | null;
  username: string | null;
  email_address: string | null;
  secret_type: string;
};

function maskAccount(value: string) {
  return value ? "••••" : "";
}

export function previewCredentialCsv(
  input: string,
  existing: ExistingCredentialIdentity[] = [],
): CredentialPreview[] {
  if (new TextEncoder().encode(input).length > CREDENTIAL_IMPORT_MAX_BYTES)
    throw new Error("Import too large");
  const [header, ...parsedRows] = parseCsv(input.replace(/^\uFEFF/, ""));
  const rows = parsedRows.filter((row) => row.some((cell) => cell.trim()));
  if (!header) return [];
  const names = header.map(normalize);
  if (new Set(names).size !== names.length) throw new Error("Duplicate header");
  if (rows.some((row) => row.length !== header.length)) throw new Error("Invalid CSV column count");
  const find = (...aliases: string[]) => names.findIndex((name) => aliases.includes(name));
  const originColumn = find("url", "website", "origin", "loginuri");
  const accountColumn = find("username", "login", "account", "loginusername");
  const emailColumn = find("email", "emailaddress", "loginemail");
  const kindColumn = find("type", "kind");
  if (originColumn < 0 || (accountColumn < 0 && emailColumn < 0))
    throw new Error("Unsupported CSV columns");
  const proton = names.includes("vault") && names.includes("type") && names.includes("password");
  const seen = new Set<string>();
  return rows
    .filter((row) => row.some((cell) => cell.trim()))
    .map((row, index) => {
      const issues: string[] = [];
      let origin: string | null = null;
      const rawUrl = row[originColumn]?.trim() || "";
      const urls = proton ? rawUrl.split(/,\s*/).filter(Boolean) : [rawUrl];
      if (urls.length > 1) issues.push("Multiple websites require review");
      try {
        const parsed = new URL(urls[0] || "");
        if (parsed.protocol !== "https:") throw new Error("HTTPS required");
        if (parsed.username || parsed.password) issues.push("URL contains embedded credentials");
        origin = parsed.origin;
      } catch {
        issues.push("Invalid HTTPS origin");
      }
      const account = (row[accountColumn] || row[emailColumn] || "").trim();
      if (!account) issues.push("Missing account");
      if (/^[=+@-]/.test(account)) issues.push("Spreadsheet formula requires review");
      const rawKind = normalize(row[kindColumn] || "password");
      const kind =
        rawKind === "password" || rawKind === "login" || rawKind === "apikey"
          ? rawKind === "apikey"
            ? "api_key"
            : "password"
          : "unknown";
      if (kind === "unknown") issues.push("Unknown credential type");
      // Usernames may be case-sensitive. Never silently merge accounts.
      const key = JSON.stringify([origin, account, kind]);
      if (seen.has(key)) issues.push("Duplicate within import");
      seen.add(key);
      if (
        existing.some((item) => {
          let itemOrigin: string;
          try {
            itemOrigin = new URL(item.website || "").origin;
          } catch {
            return false;
          }
          return (
            origin === itemOrigin &&
            kind === item.secret_type &&
            (account === item.username || account === item.email_address)
          );
        })
      )
        issues.push("Existing credential requires review");
      return {
        row: index + 2,
        origin,
        account: maskAccount(account),
        kind,
        status: issues.length ? ("review" as const) : ("ready" as const),
        issues,
      };
    });
}

/** Flat JSON schema only. Unknown/nested exports fail closed without echoing source. */
export function previewCredentialJson(
  input: string,
  existing: ExistingCredentialIdentity[] = [],
): CredentialPreview[] {
  if (new TextEncoder().encode(input).length > CREDENTIAL_IMPORT_MAX_BYTES)
    throw new Error("Import too large");
  let data: unknown;
  try {
    data = JSON.parse(input.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("Invalid JSON");
  }
  if (!Array.isArray(data)) throw new Error("JSON must be an array of flat records");
  if (data.length > MAX_ROWS) throw new Error("Too many rows");
  const headers = ["url", "username", "type"];
  const quote = (value: string) => '"' + value.replaceAll('"', '""') + '"';
  const rows = data.map((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item))
      throw new Error("Invalid JSON record");
    const record = item as Record<string, unknown>;
    if (Object.values(record).some((v) => typeof v !== "string"))
      throw new Error("Only flat string fields are supported");
    if (!("url" in record) || !("username" in record))
      throw new Error("JSON records require url and username");
    if (Object.values(record).some((v) => (v as string).length > MAX_CELL))
      throw new Error("Cell too long");
    return headers
      .map((key) =>
        quote((record[key] as string | undefined) ?? (key === "type" ? "password" : "")),
      )
      .join(",");
  });
  return previewCredentialCsv([headers.join(","), ...rows].join("\n"), existing);
}
