/** Deliberately allowlist display fields; never serialize broker state or tokens. */
export function connectionIdentity(value: unknown) {
  const data =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const text = (key: string) =>
    typeof data[key] === "string" ? (data[key] as string).trim().slice(0, 160) : "";
  return {
    label: text("account_label"),
    login: text("account_login") || text("login") || text("username"),
    name: text("account_name") || text("name"),
    email: text("account_email") || text("email"),
  };
}

export function connectionAuthType(value: unknown): "none" | "bearer" | "api_key" {
  const metadata =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return metadata["auth_type"] === "none"
    ? "none"
    : metadata["auth_type"] === "api_key"
      ? "api_key"
      : "bearer";
}

/** Return a service address without embedded credentials, query secrets or fragments. */
export function connectionEndpoint(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return "";
    return `${url.origin}${url.pathname}`;
  } catch {
    return "";
  }
}
