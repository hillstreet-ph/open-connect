export function managedAccountId(reference: string) {
  const match = /^composio:\/\/connected-account\/([A-Za-z0-9_-]{1,200})$/.exec(reference);
  if (!match) throw new Error("Invalid managed account reference.");
  return match[1]!;
}
export function assertManagedAccount(
  provider: string,
  allowedOwners: string[],
  account: {
    id?: string;
    user_id?: string;
    status?: string;
    toolkit?: { slug?: string };
    is_disabled?: boolean;
    auth_config?: { is_disabled?: boolean };
  },
  expectedId: string,
) {
  if (
    account.id !== expectedId ||
    account.status !== "ACTIVE" ||
    account.is_disabled ||
    account.auth_config?.is_disabled ||
    account.toolkit?.slug?.toLowerCase() !== provider.toLowerCase() ||
    !account.user_id ||
    !allowedOwners.includes(account.user_id)
  )
    throw new Error("Managed account is not active and owned for this provider.");
  return account.user_id;
}
const SAFE_READS = new Set([
  "TINYFISH_LIST_PROFILES",
  "TINYFISH_GET_PROFILE",
  "APIFY_USERS_ME_GET",
  "APIFY_USERS_ME_LIMITS_GET",
  "TELEGRAM_GET_ME",
]);
export function managedToolDescriptor(provider: string, tool: Record<string, unknown>) {
  const toolkit = tool["toolkit"] as { slug?: string } | undefined;
  if (toolkit?.slug?.toLowerCase() !== provider.toLowerCase() || typeof tool["slug"] !== "string")
    throw new Error("Managed tool does not belong to this provider.");
  const raw = tool["input_parameters"];
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("Managed tool schema is unavailable.");
  const params = raw as Record<string, unknown>;
  const inputSchema =
    params["type"] === "object"
      ? params
      : {
          type: "object",
          properties: Object.fromEntries(
            Object.entries(params).map(([name, schema]) => {
              if (!schema || typeof schema !== "object" || Array.isArray(schema))
                throw new Error("Managed tool schema is invalid.");
              const { required: _required, ...property } = schema as Record<string, unknown>;
              return [name, property];
            }),
          ),
          required: Object.entries(params)
            .filter(([, schema]) => (schema as Record<string, unknown>)["required"] === true)
            .map(([name]) => name),
        };
  const readOnly = SAFE_READS.has(tool["slug"]);
  return {
    name: tool["slug"],
    description: String(tool["description"] ?? "").slice(0, 4000),
    inputSchema,
    annotations: { readOnlyHint: readOnly, destructiveHint: !readOnly, openWorldHint: true },
    _meta: { execution_route: "composio", version: String(tool["version"] ?? "latest") },
  };
}
