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
