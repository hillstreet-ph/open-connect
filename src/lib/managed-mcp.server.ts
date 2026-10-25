import {
  managedAccountId,
  assertManagedAccount,
  managedToolDescriptor,
} from "./managed-mcp-policy.ts";
import {
  composioRequest,
  getManagedConnection,
  managedIdentityIds,
} from "./managed-connectors.server.ts";
import { redactDataExport } from "./data-controls.ts";

async function owned(userId: string, provider: string, reference: string) {
  const id = managedAccountId(reference);
  const account = await getManagedConnection(provider, id);
  const owner = assertManagedAccount(provider, managedIdentityIds(userId), account, id);
  return { id, owner };
}
function key() {
  const value = process.env["COMPOSIO_API_KEY"]?.trim();
  if (!value) throw new Error("Managed executor is not configured.");
  return value;
}
export async function listManagedMcpTools(userId: string, provider: string, reference: string) {
  try {
    await owned(userId, provider, reference);
    const tools: Array<ReturnType<typeof managedToolDescriptor>> = [];
    const cursors = new Set<string>();
    let cursor = "";
    for (let page = 0; page < 10; page++) {
      const query = new URLSearchParams({
        toolkit_slug: provider,
        limit: "100",
        include_deprecated: "false",
        toolkit_versions: "latest",
      });
      if (cursor) query.set("cursor", cursor);
      const result = await composioRequest<{
        items?: Array<Record<string, unknown>>;
        next_cursor?: string | null;
      }>(`/tools?${query}`, key());
      if (!Array.isArray(result.items)) throw new Error("Managed catalog is unavailable.");
      for (const tool of result.items) tools.push(managedToolDescriptor(provider, tool));
      if (!result.next_cursor) return tools;
      if (cursors.has(result.next_cursor)) throw new Error("Managed pagination did not advance.");
      cursors.add(result.next_cursor);
      cursor = result.next_cursor;
    }
    throw new Error("Managed catalog exceeds the discovery limit.");
  } catch {
    throw new Error(
      "Managed tool discovery failed. Check account authorization and provider access.",
    );
  }
}
export async function callManagedMcpTool(
  userId: string,
  provider: string,
  reference: string,
  name: string,
  args: Record<string, unknown>,
) {
  try {
    const account = await owned(userId, provider, reference);
    const tool = await composioRequest<Record<string, unknown>>(
      `/tools/${encodeURIComponent(name)}?toolkit_versions=latest`,
      key(),
    );
    const descriptor = managedToolDescriptor(provider, tool);
    if (descriptor.name !== name)
      throw new Error("Managed tool schema does not match the requested action.");
    const result = await composioRequest<{ successful?: boolean; error?: unknown; data?: unknown }>(
      `/tools/execute/${encodeURIComponent(name)}`,
      key(),
      {
        method: "POST",
        redirect: "manual",
        body: JSON.stringify({
          connected_account_id: account.id,
          user_id: account.owner,
          version: descriptor._meta.version,
          arguments: args,
        }),
      },
    );
    return {
      content: [
        { type: "text" as const, text: JSON.stringify(redactDataExport(result.data ?? {})) },
      ],
      isError: result.successful !== true || Boolean(result.error),
    };
  } catch {
    return {
      content: [
        {
          type: "text" as const,
          text: "Managed provider action did not complete. Check the account and current state before retrying.",
        },
      ],
      isError: true,
    };
  }
}
