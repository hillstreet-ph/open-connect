/** Only present a command editor for known execution tools with an advertised string field. */
export function terminalEditorField(name: string, schemaText: string): string | null {
  const fields: Record<string, string[]> = {
    run_command: ["command", "cmd"],
    execute_command: ["command", "cmd"],
    run_code: ["code"],
    execute_code: ["code"],
  };
  const choices = fields[name];
  if (!choices) return null;
  try {
    const schema: unknown = JSON.parse(schemaText);
    if (!schema || typeof schema !== "object" || Array.isArray(schema)) return null;
    const properties = (schema as Record<string, unknown>)["properties"];
    if (!properties || typeof properties !== "object" || Array.isArray(properties)) return null;
    for (const field of choices) {
      const property = (properties as Record<string, unknown>)[field];
      if (
        property &&
        typeof property === "object" &&
        !Array.isArray(property) &&
        (property as Record<string, unknown>)["type"] === "string"
      )
        return field;
    }
  } catch {
    /* Unsupported provider schema: use the existing JSON input. */
  }
  return null;
}

/** Preserve provider-specific fields such as sandbox IDs and language. */
export function terminalArgumentsWithText(raw: string, field: string, value: string): string {
  const args: unknown = JSON.parse(raw);
  if (!args || typeof args !== "object" || Array.isArray(args))
    throw new Error("Arguments must be a JSON object.");
  return JSON.stringify({ ...args, [field]: value }, null, 2);
}
