/** Produces a secret-free preview; never persist or log raw CSV. */
export type CredentialPreview = {
  row: number;
  origin: string | null;
  account: string;
  kind: "password" | "api_key" | "unknown";
  status: "ready" | "review";
  issues: string[];
};

const MAX_BYTES = 2_000_000;
const MAX_ROWS = 5_000;
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
  return rows;
}

export function previewCredentialCsv(input: string): CredentialPreview[] {
  if (new TextEncoder().encode(input).length > MAX_BYTES) throw new Error("CSV too large");
  const [header, ...rows] = parseCsv(input.replace(/^\uFEFF/, ""));
  if (!header) return [];
  const names = header.map(normalize);
  if (new Set(names).size !== names.length) throw new Error("Duplicate header");
  if (rows.some((row) => row.length !== header.length)) throw new Error("Invalid CSV column count");
  const find = (...aliases: string[]) => names.findIndex((name) => aliases.includes(name));
  const originColumn = find("url", "website", "origin", "loginuri");
  const accountColumn = find("username", "email", "login", "account");
  const kindColumn = find("type", "kind");
  if (originColumn < 0 || accountColumn < 0) throw new Error("Unsupported CSV columns");
  const seen = new Set<string>();
  return rows
    .filter((row) => row.some((cell) => cell.trim()))
    .map((row, index) => {
      const issues: string[] = [];
      let origin: string | null = null;
      const rawUrl = row[originColumn]?.trim() || "";
      try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol !== "https:") throw new Error("HTTPS required");
        origin = parsed.origin;
      } catch {
        issues.push("Invalid HTTPS origin");
      }
      const account = (row[accountColumn] || "").trim();
      if (!account) issues.push("Missing account");
      const rawKind = normalize(row[kindColumn] || "password");
      const kind =
        rawKind === "password" || rawKind === "apikey"
          ? rawKind === "apikey"
            ? "api_key"
            : "password"
          : "unknown";
      if (kind === "unknown") issues.push("Unknown credential type");
      const key = JSON.stringify([origin, account.toLowerCase(), kind]);
      if (seen.has(key)) issues.push("Duplicate within import");
      seen.add(key);
      return {
        row: index + 2,
        origin,
        account: account.replace(/[\r\n\t]/g, " "),
        kind,
        status: issues.length ? ("review" as const) : ("ready" as const),
        issues,
      };
    });
}
