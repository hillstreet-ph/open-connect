/** Never forward sandbox access tokens, environment variables or arbitrary metadata. */
export function sandboxSummary(value: unknown) {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const text = (key: string) => (typeof row[key] === "string" ? (row[key] as string) : null);
  return {
    id: text("sandboxID") ?? text("sandboxId"),
    template: text("templateID"),
    state: text("state"),
    startedAt: text("startedAt"),
    endAt: text("endAt"),
  };
}
