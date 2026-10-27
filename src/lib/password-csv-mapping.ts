import { mapProtonLogin, type ProtonCsvRow, type ProtonLoginMapping } from "./proton-import.ts";

export type CsvSource = "proton" | "bitwarden" | "1password" | "browser" | "unknown";

const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/[\s_-]+/g, "");

/** Detect documented schemas; reject ambiguous or duplicate fields instead of guessing. */
export function detectPasswordCsv(headers: string[]): CsvSource {
  const names = headers.map(normalizeHeader);
  if (names.some((name) => !name) || new Set(names).size !== names.length) return "unknown";
  const has = (...required: string[]) => required.every((name) => names.includes(name));
  if (has("type", "name", "url", "password", "vault")) return "proton";
  if (has("type", "name", "loginuri", "loginusername", "loginpassword")) return "bitwarden";
  if (has("title", "website", "username", "password") && !names.includes("url"))
    return "1password";
  if (has("url", "username", "password")) return "browser";
  return "unknown";
}

/** Sensitive output is intended only for a future authenticated ingestion boundary. */
export function mapPasswordCsvRow(headers: string[], values: string[]): ProtonLoginMapping {
  const source = detectPasswordCsv(headers);
  if (source === "unknown" || headers.length !== values.length)
    return { status: "review", issues: ["Unsupported or malformed CSV format"] };
  const cells = new Map(headers.map((name, index) => [normalizeHeader(name), values[index] || ""]));
  const read = (name: string) => cells.get(name) || "";
  const knownBySource: Record<Exclude<CsvSource, "unknown">, string[]> = {
    proton: ["type", "name", "url", "email", "username", "password", "note", "totp", "autofillurls", "vault"],
    bitwarden: ["type", "name", "loginuri", "loginusername", "loginpassword", "logintotp", "notes", "fields", "folder", "favorite", "reprompt"],
    "1password": ["title", "website", "username", "password", "onetimepassword", "otpauth", "otp", "favorite", "archived", "tags", "notes"],
    browser: ["name", "title", "url", "username", "password", "note", "notes"],
  };
  const known = new Set(knownBySource[source]);
  if ([...cells].some(([name, value]) => !known.has(name) && value.trim()))
    return { status: "review", issues: ["Additional fields need review"] };
  let row: ProtonCsvRow;
  if (source === "proton") {
    row = {
      type: read("type"),
      name: read("name"),
      url: read("url"),
      email: read("email"),
      username: read("username"),
      password: read("password"),
      note: read("note"),
      totp: read("totp"),
      autofillUrls: read("autofillurls"),
      vault: read("vault"),
    };
  } else if (source === "bitwarden") {
    row = {
      type: read("type"),
      name: read("name"),
      url: read("loginuri"),
      username: read("loginusername"),
      password: read("loginpassword"),
      totp: read("logintotp"),
      note: read("notes"),
    };
    if (
      read("fields") ||
      read("folder") ||
      !["", "0"].includes(read("favorite")) ||
      !["", "0"].includes(read("reprompt"))
    )
      return { status: "review", issues: ["Item metadata needs review"] };
  } else if (source === "1password") {
    if (
      read("favorite") ||
      read("archived") ||
      read("tags") ||
      ["onetimepassword", "otpauth", "otp"].filter((key) => read(key)).length > 1
    )
      return { status: "review", issues: ["Item metadata needs review"] };
    row = {
      type: "login",
      name: read("title"),
      url: read("website"),
      username: read("username"),
      password: read("password"),
      totp: read("onetimepassword") || read("otpauth") || read("otp"),
      note: read("notes"),
    };
  } else {
    const url = read("url");
    let fallback = "";
    try {
      fallback = new URL(url).hostname;
    } catch {
      // The common validator reports invalid URLs without returning their contents.
    }
    row = {
      type: "login",
      name: read("name") || read("title") || fallback,
      url,
      username: read("username"),
      password: read("password"),
      note: read("note") || read("notes"),
    };
  }
  return mapProtonLogin(row);
}
