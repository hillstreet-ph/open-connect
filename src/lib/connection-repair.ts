import {
  isExecutableMcpProvider,
  isHostedMcpProvider,
  normalizeRemoteMcpEndpoint,
} from "./remote-mcp.ts";

export type RepairConnection = {
  id: string;
  user_id: string;
  provider: string;
  display_name: string;
  status: string;
  credential_reference: string | null;
  metadata: Record<string, unknown>;
  scopes: string[];
  updated_at: string;
};
export type RepairInput = {
  connection_id: string;
  action: "inspect" | "validate" | "apply";
  expected_updated_at?: string | undefined;
  credential_id?: string | undefined;
  endpoint_url?: string | undefined;
  auth_type?: "none" | "bearer" | "api_key" | "personal_access_token" | undefined;
};
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
function origin(value: unknown) {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" && !url.username && !url.password ? url.origin : null;
  } catch {
    return null;
  }
}
function snapshot(row: RepairConnection) {
  return {
    id: row.id,
    provider: row.provider,
    name: row.display_name,
    status: row.status,
    updated_at: row.updated_at,
    endpoint_origin: origin(row.metadata["endpoint_url"]),
    auth_type: ["none", "bearer", "api_key", "personal_access_token"].includes(
      String(row.metadata["auth_type"]),
    )
      ? row.metadata["auth_type"]
      : null,
    credential_id:
      row.credential_reference?.match(/^credential:\/\/[^/]+\/([0-9a-f-]{36})$/i)?.[1] ?? null,
    secrets_exposed: false,
  };
}

/** Exact owner-scoped repair; validation precedes an optimistic update, never an insert. */
export async function repairOwnedConnection(
  userId: string,
  input: RepairInput,
  deps: {
    load: () => Promise<RepairConnection | null>;
    credential: (id: string) => Promise<{ secret_type: string; website: string | null } | null>;
    validate: (candidate: RepairConnection) => Promise<number>;
    update: (candidate: RepairConnection, expected: string) => Promise<RepairConnection | null>;
  },
) {
  if (!["inspect", "validate", "apply"].includes(input.action))
    throw new Error("Choose inspect, validate or apply.");
  if (
    input.auth_type !== undefined &&
    !["none", "bearer", "api_key", "personal_access_token"].includes(input.auth_type)
  )
    throw new Error("Choose a supported authentication type.");
  if (!UUID.test(input.connection_id)) throw new Error("Invalid connection ID.");
  const saved = await deps.load();
  if (!saved || saved.user_id !== userId || saved.id !== input.connection_id)
    throw new Error("Owned connection not found.");
  if (input.action === "inspect") return { connection: snapshot(saved), applied: false };
  if (!isExecutableMcpProvider(saved.provider) || saved.provider === "custom_api")
    throw new Error("Use this provider's dedicated setup page.");
  if (!input.expected_updated_at || saved.updated_at !== input.expected_updated_at)
    throw new Error("Connection changed. Inspect its current revision before repair.");
  const candidate = { ...saved, metadata: { ...saved.metadata } };
  let website: string | null = null;
  if (input.credential_id) {
    if (!UUID.test(input.credential_id)) throw new Error("Invalid credential ID.");
    const credential = await deps.credential(input.credential_id);
    if (!credential || credential.secret_type !== "api_key")
      throw new Error("Choose an owned API key credential.");
    website = credential.website;
    candidate.credential_reference = `credential://${saved.provider}/${input.credential_id}`;
  }
  if (input.endpoint_url !== undefined) {
    if (isHostedMcpProvider(saved.provider))
      throw new Error("Hosted provider endpoints are fixed.");
    const endpoint = normalizeRemoteMcpEndpoint(saved.provider, input.endpoint_url);
    const parsed = new URL(endpoint);
    if (parsed.search || parsed.hash)
      throw new Error("Keep credentials and query parameters out of the MCP endpoint.");
    const nextOrigin = parsed.origin;
    if (
      saved.provider !== "apify_mcp" &&
      nextOrigin !== origin(saved.metadata["endpoint_url"]) &&
      nextOrigin !== origin(website)
    )
      throw new Error(
        "Endpoint origin must match the saved endpoint or the selected credential website.",
      );
    candidate.metadata["endpoint_url"] = endpoint;
  }
  if (input.auth_type !== undefined) candidate.metadata["auth_type"] = input.auth_type;
  if (!isHostedMcpProvider(candidate.provider)) {
    candidate.metadata["endpoint_url"] = normalizeRemoteMcpEndpoint(
      candidate.provider,
      candidate.metadata["endpoint_url"],
    );
  }
  let count: number;
  try {
    count = await deps.validate(candidate);
  } catch {
    throw new Error("Provider validation failed. The connection was not changed.");
  }
  if (input.action === "validate")
    return { connection: snapshot(candidate), verified: true, tool_count: count, applied: false };
  if (input.action !== "apply") throw new Error("Choose inspect, validate or apply.");
  const updated = await deps.update({ ...candidate, status: "connected" }, saved.updated_at);
  if (!updated) throw new Error("Connection changed during validation. No repair was applied.");
  return { connection: snapshot(updated), verified: true, tool_count: count, applied: true };
}
