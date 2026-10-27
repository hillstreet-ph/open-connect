/**
 * Password-manager import: parses exports from Proton Pass (CSV or unencrypted ZIP/JSON),
 * Bitwarden (CSV or unencrypted JSON), 1Password CSV, LastPass CSV, Firefox CSV and
 * Chromium/Safari browser CSV into vault-ready items.
 *
 * Items hold secret values. Keep them in memory only: never log, cache, persist or render
 * `password`, `totp_secret` or `notes`. `summarizeImportItem` is the only safe display shape.
 */

export type ImportSource =
  "proton" | "bitwarden" | "1password" | "lastpass" | "firefox" | "browser" | "generic";

export type ImportStatus = "ready" | "skipped" | "duplicate";

export type ImportItem = {
  row: number;
  source: ImportSource;
  status: ImportStatus;
  /** Why the item is skipped, or what changed while mapping it (no secret content). */
  reasons: string[];
  name: string;
  secret_type: "password" | "totp" | "other";
  website: string;
  email_address: string;
  username: string;
  password: string;
  totp_secret: string;
  notes: string;
  tags: string[];
};

export const CREDENTIAL_IMPORT_MAX_BYTES = 10_000_000;
const MAX_ROWS = 20_000;
const MAX_CELL = 65_536;
const NOTES_LIMIT = 4000;
const SOURCE_LABEL: Record<ImportSource, string> = {
  proton: "Proton Pass",
  bitwarden: "Bitwarden",
  "1password": "1Password",
  lastpass: "LastPass",
  firefox: "Firefox",
  browser: "Browser",
  generic: "CSV",
};

export const importSourceLabel = (source: ImportSource) => SOURCE_LABEL[source];

const normalizeHeader = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "");

export function parseCsv(input: string): string[][] {
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

/**
 * Returns a Base32 seed the vault can generate codes for (SHA-1, 6 digits, 30 s),
 * "" for no authenticator, or null when the value is unusable by the vault.
 */
export function totpSeed(input: string): string | null {
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
    if (uri.hostname.toLowerCase() !== "totp") return null;
    const params = uri.searchParams;
    if (["secret", "algorithm", "digits", "period"].some((key) => params.getAll(key).length > 1))
      return null;
    if ((params.get("algorithm") || "SHA1").toUpperCase() !== "SHA1") return null;
    if ((params.get("digits") || "6") !== "6" || (params.get("period") || "30") !== "30")
      return null;
    secret = params.get("secret") || "";
  }
  const normalized = secret.replace(/[\s-]/g, "").toUpperCase().replace(/=+$/, "");
  if (!/^[A-Z2-7]{16,}$/.test(normalized)) return null;
  return normalized;
}

type RawEntry = {
  type: string;
  name: string;
  urls: string[];
  email: string;
  username: string;
  password: string;
  totp: string;
  notes: string;
  folder: string;
  passkeys: number;
  hiddenFields: number;
  extraText: string[];
  trashed: boolean;
};

const emptyEntry = (): RawEntry => ({
  type: "login",
  name: "",
  urls: [],
  email: "",
  username: "",
  password: "",
  totp: "",
  notes: "",
  folder: "",
  passkeys: 0,
  hiddenFields: 0,
  extraText: [],
  trashed: false,
});

const LOGIN_TYPES = new Set(["login", "password", "1", ""]);
const NOTE_TYPES = new Set(["note", "securenote", "2"]);

function splitUrls(value: string) {
  return value
    .split(/[,\n]\s*/)
    .map((url) => url.trim())
    .filter(Boolean);
}

/** Accepts https, http and app identifiers; strips embedded credentials. */
function cleanWebsite(raw: string, reasons: string[]) {
  const value = raw.trim();
  if (!value) return "";
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    if (url.username || url.password) {
      url.username = "";
      url.password = "";
      reasons.push("Removed sign-in details embedded in the website address");
    }
    if (url.protocol === "http:") reasons.push("Website does not use HTTPS");
    return url.toString().slice(0, 2048);
  } catch {
    reasons.push("Website kept as text because it is not a valid address");
    return value.slice(0, 2048);
  }
}

function hostnameOf(website: string) {
  try {
    const url = new URL(website);
    return url.hostname.replace(/^www\./, "") || url.protocol.replace(":", "");
  } catch {
    return "";
  }
}

const slugTag = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

function toItem(entry: RawEntry, row: number, source: ImportSource): ImportItem {
  const reasons: string[] = [];
  const type = normalizeHeader(entry.type);
  const base = {
    row,
    source,
    email_address: entry.email.trim().slice(0, 320),
    username: entry.username.trim().slice(0, 320),
    totp_secret: "",
    tags: [
      "imported",
      slugTag(SOURCE_LABEL[source]),
      ...(entry.folder ? [slugTag(entry.folder)] : []),
    ]
      .filter(Boolean)
      .slice(0, 20),
  };
  const skip = (reason: string): ImportItem => ({
    ...base,
    status: "skipped",
    reasons: [reason],
    name: entry.name.trim().slice(0, 120) || "Untitled",
    secret_type: "other",
    website: "",
    password: "",
    notes: "",
  });
  if (entry.trashed) return skip(`In the ${SOURCE_LABEL[source]} trash`);

  if (NOTE_TYPES.has(type)) {
    const body = entry.notes.trim();
    if (body.length < 4) return skip("Empty secure note");
    return {
      ...base,
      status: "ready",
      reasons: [],
      name: entry.name.trim().slice(0, 120) || "Secure note",
      secret_type: "other",
      website: "",
      password: body.slice(0, MAX_CELL),
      notes: "",
    };
  }
  if (!LOGIN_TYPES.has(type)) {
    return skip(`${entry.type.trim() || "This"} items are not imported; only logins and notes are`);
  }

  const urls = entry.urls.map((url) => url.trim()).filter(Boolean);
  const website = cleanWebsite(urls[0] || "", reasons);
  const noteParts = [entry.notes.trim()];
  if (urls.length > 1) {
    noteParts.push(`Additional websites:\n${urls.slice(1).join("\n")}`);
    reasons.push(`${urls.length - 1} additional website(s) saved in notes`);
  }
  if (entry.extraText.length) {
    noteParts.push(entry.extraText.join("\n"));
    reasons.push("Custom text fields saved in notes");
  }
  if (entry.hiddenFields)
    reasons.push(`${entry.hiddenFields} hidden custom field(s) not imported; add them manually`);
  if (entry.passkeys)
    reasons.push(
      `${entry.passkeys} passkey(s) cannot be transferred between password managers; sign in and create a new passkey`,
    );

  const seed = totpSeed(entry.totp);
  let totp = seed ?? "";
  if (seed === null) {
    noteParts.push(`Authenticator (unsupported settings): ${entry.totp.trim()}`);
    reasons.push("Authenticator uses non-standard settings; kept in notes instead of 2FA");
    totp = "";
  }
  let notes = noteParts.filter(Boolean).join("\n\n");
  if (notes.length > NOTES_LIMIT) {
    notes = notes.slice(0, NOTES_LIMIT);
    reasons.push("Notes shortened to 4000 characters");
  }

  const password = entry.password;
  let secretType: ImportItem["secret_type"] = "password";
  let value = password;
  if (password.length < 4) {
    if (password.length === 0 && totp) {
      secretType = "totp";
      value = totp;
      totp = "";
    } else if (password.length === 0) {
      return skip(
        entry.passkeys
          ? "Passkey-only login; passkeys cannot be transferred"
          : "No password or authenticator",
      );
    } else {
      return skip("Password shorter than 4 characters");
    }
  }
  const name =
    entry.name.trim().slice(0, 120) ||
    hostnameOf(website) ||
    base.email_address ||
    base.username ||
    "Imported login";
  return {
    ...base,
    status: "ready",
    reasons,
    name,
    secret_type: secretType,
    website,
    password: value,
    totp_secret: totp,
    notes,
  };
}

type Columns = Record<string, number>;

export function detectCsvSource(headers: string[]): ImportSource | null {
  const names = headers.map(normalizeHeader);
  const has = (...required: string[]) => required.every((name) => names.includes(name));
  if (has("type", "name", "url", "password", "vault")) return "proton";
  if (has("loginuri", "loginusername", "loginpassword")) return "bitwarden";
  if (has("url", "username", "password", "extra", "grouping")) return "lastpass";
  if (has("url", "username", "password", "httprealm")) return "firefox";
  if (has("title") && has("password") && (has("website") || has("url")) && has("username"))
    return names.includes("otpauth") ||
      names.includes("onetimepassword") ||
      names.includes("website")
      ? "1password"
      : "browser";
  if (has("name", "url", "username", "password")) return "browser";
  const url = ["url", "website", "origin", "loginuri", "uri"].some((n) => names.includes(n));
  if (url && names.includes("password")) return "generic";
  return null;
}

function readerFor(headers: string[]) {
  const columns: Columns = {};
  headers.forEach((header, index) => {
    const key = normalizeHeader(header);
    if (!(key in columns)) columns[key] = index;
  });
  return (row: string[], ...keys: string[]) => {
    for (const key of keys) {
      const index = columns[key];
      if (index !== undefined && row[index]?.trim()) return row[index];
    }
    return "";
  };
}

export function parseCredentialCsv(input: string): ImportItem[] {
  const [header, ...rows] = parseCsv(input.replace(/^\uFEFF/, ""));
  if (!header) return [];
  const source = detectCsvSource(header);
  if (!source) throw new Error("Unsupported CSV columns");
  const read = readerFor(header);
  const items: ImportItem[] = [];
  rows.forEach((row, index) => {
    if (!row.some((cell) => cell.trim())) return;
    const entry = emptyEntry();
    entry.name = read(row, "name", "title");
    entry.username = read(row, "username", "loginusername", "login");
    entry.email = read(row, "email", "emailaddress");
    entry.password = read(row, "password", "loginpassword");
    entry.totp = read(row, "totp", "logintotp", "otpauth", "onetimepassword", "otp");
    entry.notes = read(row, "note", "notes", "extra");
    entry.folder = read(row, "vault", "folder", "grouping", "tags");
    entry.type = read(row, "type") || "login";
    const urlCell = read(row, "url", "website", "loginuri", "origin", "uri");
    entry.urls = source === "proton" ? splitUrls(urlCell) : urlCell.trim() ? [urlCell] : [];
    if (source === "lastpass" && urlCell.trim() === "http://sn") {
      entry.type = "note";
      entry.urls = [];
    }
    if (source === "bitwarden" && read(row, "fields")) entry.extraText.push(read(row, "fields"));
    items.push(toItem(entry, index + 2, source));
  });
  return items;
}

type JsonValue = unknown;
const obj = (value: JsonValue): Record<string, JsonValue> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, JsonValue>)
    : {};
const str = (value: JsonValue) => (typeof value === "string" ? value : "");
const arr = (value: JsonValue) => (Array.isArray(value) ? value : []);

/** Proton Pass unencrypted export (`Proton Pass/data.json`). */
function parseProtonJson(data: Record<string, JsonValue>): ImportItem[] {
  if (data["encrypted"] === true)
    throw new Error("Encrypted export: choose ZIP or CSV in Proton Pass");
  const items: ImportItem[] = [];
  let row = 0;
  for (const vault of Object.values(obj(data["vaults"]))) {
    const vaultName = str(obj(vault)["name"]);
    for (const raw of arr(obj(vault)["items"])) {
      row++;
      const item = obj(raw);
      const body = obj(item["data"]);
      const metadata = obj(body["metadata"]);
      const content = obj(body["content"]);
      const entry = emptyEntry();
      entry.type = str(body["type"]) || "login";
      entry.name = str(metadata["name"]);
      entry.notes = str(metadata["note"]);
      entry.folder = vaultName;
      entry.email = str(content["itemEmail"]);
      entry.username = str(content["itemUsername"]) || str(content["username"]);
      entry.password = str(content["password"]);
      entry.totp = str(content["totpUri"]);
      entry.urls = arr(content["urls"]).map(str).filter(Boolean);
      entry.passkeys = arr(content["passkeys"]).length;
      // Proton item state 2 is "trashed".
      entry.trashed = item["state"] === 2;
      for (const fieldRaw of arr(body["extraFields"])) {
        const field = obj(fieldRaw);
        const value = str(obj(field["data"])["content"]);
        if (!value) continue;
        if (field["type"] === "text") entry.extraText.push(`${str(field["fieldName"])}: ${value}`);
        else if (field["type"] === "totp" && !entry.totp) entry.totp = value;
        else entry.hiddenFields++;
      }
      items.push(toItem(entry, row, "proton"));
    }
  }
  return items;
}

/** Bitwarden unencrypted JSON export. */
function parseBitwardenJson(data: Record<string, JsonValue>): ImportItem[] {
  if (data["encrypted"] === true)
    throw new Error("Encrypted export: choose unencrypted JSON or CSV in Bitwarden");
  const folders = new Map(
    arr(data["folders"]).map((folder) => [str(obj(folder)["id"]), str(obj(folder)["name"])]),
  );
  return arr(data["items"]).map((raw, index) => {
    const item = obj(raw);
    const login = obj(item["login"]);
    const entry = emptyEntry();
    entry.type = String(item["type"] ?? "1");
    entry.name = str(item["name"]);
    entry.notes = str(item["notes"]);
    entry.folder = folders.get(str(item["folderId"])) || "";
    entry.username = str(login["username"]);
    entry.password = str(login["password"]);
    entry.totp = str(login["totp"]);
    entry.urls = arr(login["uris"])
      .map((uri) => str(obj(uri)["uri"]))
      .filter(Boolean);
    entry.passkeys = arr(login["fido2Credentials"]).length;
    for (const fieldRaw of arr(item["fields"])) {
      const field = obj(fieldRaw);
      const value = str(field["value"]);
      if (!value) continue;
      if (field["type"] === 0) entry.extraText.push(`${str(field["name"])}: ${value}`);
      else entry.hiddenFields++;
    }
    return toItem(entry, index + 1, "bitwarden");
  });
}

/** Simple JSON array of flat records (url, username/email, password, totp, notes, name). */
function parseFlatJson(data: JsonValue[]): ImportItem[] {
  return data.map((raw, index) => {
    const record = obj(raw);
    const entry = emptyEntry();
    entry.type = str(record["type"]) || "login";
    entry.name = str(record["name"]) || str(record["title"]);
    entry.urls = [str(record["url"]) || str(record["website"])].filter(Boolean);
    entry.username = str(record["username"]);
    entry.email = str(record["email"]);
    entry.password = str(record["password"]);
    entry.totp = str(record["totp"]);
    entry.notes = str(record["notes"]) || str(record["note"]);
    return toItem(entry, index + 1, "generic");
  });
}

export function parseCredentialJson(input: string): ImportItem[] {
  let data: JsonValue;
  try {
    data = JSON.parse(input.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("Invalid JSON");
  }
  if (Array.isArray(data)) {
    if (data.length > MAX_ROWS) throw new Error("Too many rows");
    return parseFlatJson(data);
  }
  const root = obj(data);
  if ("vaults" in root) return parseProtonJson(root);
  if ("items" in root) return parseBitwardenJson(root);
  throw new Error("Unsupported JSON export");
}

/** Minimal ZIP reader (stored + deflate) for password-manager exports. */
export async function readZipEntries(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a ZIP file");
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const entries = new Map<string, Uint8Array>();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error("Corrupt ZIP");
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressed = view.getUint32(offset + 20, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const local = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith("/")) continue;
    if (flags & 1) throw new Error("Password-protected ZIP");
    if (size > CREDENTIAL_IMPORT_MAX_BYTES * 5) throw new Error("ZIP entry too large");
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + compressed);
    if (method === 0) entries.set(name, data);
    else if (method === 8) {
      const stream = new Blob([new Uint8Array(data)])
        .stream()
        .pipeThrough(new DecompressionStream("deflate-raw"));
      entries.set(name, new Uint8Array(await new Response(stream).arrayBuffer()));
    } else throw new Error("Unsupported ZIP compression");
  }
  return entries;
}

export async function parseCredentialFile(name: string, bytes: Uint8Array): Promise<ImportItem[]> {
  const extension = name.toLowerCase().split(".").pop();
  const decode = (data: Uint8Array) => new TextDecoder("utf-8", { fatal: true }).decode(data);
  if (extension === "pgp" || extension === "gpg")
    throw new Error("Encrypted export: choose ZIP or CSV when exporting");
  if (extension === "zip") {
    const entries = await readZipEntries(bytes);
    const json = [...entries.keys()].find((key) => /(^|\/)data\.json$/i.test(key));
    if (json) return parseCredentialJson(decode(entries.get(json)!));
    const csv = [...entries.keys()].find((key) => key.toLowerCase().endsWith(".csv"));
    if (csv) return parseCredentialCsv(decode(entries.get(csv)!));
    throw new Error("ZIP has no supported export");
  }
  if (extension === "json") return parseCredentialJson(decode(bytes));
  return parseCredentialCsv(decode(bytes));
}

export type ExistingCredentialIdentity = {
  name: string;
  secret_type: string;
  website: string | null;
  username: string | null;
  email_address: string | null;
};

function originKey(website: string | null | undefined) {
  if (!website) return "";
  try {
    const url = new URL(website);
    return url.origin === "null" ? website.trim() : url.origin.toLowerCase();
  } catch {
    return website.trim();
  }
}

const identityKey = (item: {
  name: string;
  secret_type: string;
  website: string | null;
  username: string | null;
  email_address: string | null;
}) =>
  JSON.stringify([
    item.name.trim().toLowerCase(),
    item.secret_type,
    (item.email_address ?? "").trim().toLowerCase(),
    (item.username ?? "").trim(),
    originKey(item.website),
  ]);

/**
 * Removes exact duplicates (same login and same secret), skips entries already in the vault,
 * and gives distinct names to same-account entries whose secrets differ.
 */
export function dedupeImportItems(
  items: ImportItem[],
  existing: ExistingCredentialIdentity[] = [],
): ImportItem[] {
  const vault = new Set(existing.map(identityKey));
  const exact = new Set<string>();
  const names = new Set<string>();
  return items.map((item) => {
    if (item.status !== "ready") return item;
    const secretKey = JSON.stringify([
      item.secret_type,
      originKey(item.website),
      item.username,
      item.email_address.toLowerCase(),
      item.password,
      item.totp_secret,
    ]);
    if (exact.has(secretKey))
      return { ...item, status: "duplicate", reasons: ["Exact duplicate of an earlier row"] };
    exact.add(secretKey);
    if (vault.has(identityKey(item)))
      return { ...item, status: "duplicate", reasons: ["Already in your vault"] };
    let candidate = item;
    for (let n = 2; names.has(identityKey(candidate)); n++)
      candidate = { ...item, name: `${item.name.slice(0, 112)} (${n})` };
    names.add(identityKey(candidate));
    if (candidate !== item)
      return {
        ...candidate,
        reasons: [...item.reasons, "Same account with a different password; saved separately"],
      };
    return item;
  });
}

export type ImportItemSummary = {
  row: number;
  name: string;
  site: string;
  account: string;
  type: ImportItem["secret_type"];
  has_totp: boolean;
  status: ImportStatus;
  reasons: string[];
};

/** Display-safe projection: no password, seed or notes; account masked. */
export function summarizeImportItem(item: ImportItem): ImportItemSummary {
  const account = item.email_address || item.username;
  const masked = account.includes("@")
    ? `${account[0]}•••@${account.split("@").pop()}`
    : account
      ? `${account[0]}•••`
      : "";
  return {
    row: item.row,
    name: item.name,
    site: hostnameOf(item.website) || item.website,
    account: masked,
    type: item.secret_type,
    has_totp: item.secret_type === "totp" || Boolean(item.totp_secret),
    status: item.status,
    reasons: item.reasons,
  };
}
