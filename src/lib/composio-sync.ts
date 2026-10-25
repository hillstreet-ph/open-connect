type ManagedAccount = { id: string; provider: string };
type SavedConnection = {
  id?: string;
  provider: string;
  display_name?: string | null;
  provider_account_id: string | null;
  credential_reference: string | null;
};

function brokerAccountId(connection: SavedConnection) {
  return connection.credential_reference?.match(/^composio:\/\/connected-account\/([^/]+)$/)?.[1];
}

/** Plan metadata imports only. Account ownership and ACTIVE status are checked by the broker. */
export function planComposioSync(
  accounts: ManagedAccount[],
  saved: SavedConnection[],
  catalog: Array<{ slug: string; name: string }>,
) {
  const existing = new Set<string>();
  for (const connection of saved) {
    const accountId = brokerAccountId(connection);
    if (accountId) existing.add(accountId);
  }
  const labels = new Map(catalog.map((item) => [item.slug, item.name]));
  const unique = new Map(accounts.map((account) => [account.id, account]));
  const candidates = [...unique.values()]
    .filter((account) => !existing.has(account.id))
    .map((account) => ({
      account_id: account.id,
      provider: account.provider,
      display_name: labels.get(account.provider) ?? account.provider,
    }));
  return {
    matched: unique.size,
    existing: unique.size - candidates.length,
    candidates,
  };
}

/** Redacted read-back for one explicitly requested, configured broker identity. */
export function planComposioAccountMapping(
  externalAccountId: string,
  accounts: ManagedAccount[],
  saved: SavedConnection[],
  catalog: Array<{ slug: string; name: string }>,
) {
  const labels = new Map(catalog.map((item) => [item.slug, item.name]));
  const existing = new Map<string, SavedConnection>();
  for (const connection of saved) {
    const accountId = brokerAccountId(connection);
    if (accountId && !existing.has(accountId)) existing.set(accountId, connection);
  }
  const unique = new Map(accounts.map((account) => [account.id, account]));
  const connections = [...unique.values()].map((account) => {
    const connection = existing.get(account.id);
    return {
      provider: account.provider,
      display_name:
        connection?.display_name?.trim() || labels.get(account.provider) || account.provider,
      sync_state: connection ? "existing" : "candidate",
      connection_id: connection?.id ?? null,
    };
  });
  const existingCount = connections.filter(
    (connection) => connection.sync_state === "existing",
  ).length;
  return {
    external_account_id: externalAccountId,
    matched: unique.size,
    existing: existingCount,
    candidate_count: unique.size - existingCount,
    connections,
  };
}

/** Explicit, owned metadata imports. Provider permissions and project grants are not changed. */
export function composioImportRecords(
  userId: string,
  accounts: ManagedAccount[],
  saved: SavedConnection[],
  catalog: Array<{ slug: string; name: string }>,
  requested: unknown,
) {
  if (
    !Array.isArray(requested) ||
    !requested.length ||
    requested.length > 100 ||
    requested.some((id) => typeof id !== "string" || !id.trim() || id.length > 256)
  )
    throw new Error("Select 1–100 exact account IDs from the current preview.");
  const selected = new Set(requested as string[]);
  const owned = new Set(accounts.map((a) => a.id));
  if ([...selected].some((id) => !owned.has(id)))
    throw new Error("A selected account is not an owned ACTIVE Composio account.");
  const plan = planComposioSync(accounts, saved, catalog);
  const records = plan.candidates
    .filter((a) => selected.has(a.account_id))
    .map((account) => ({
      user_id: userId,
      provider: account.provider,
      provider_account_id: account.account_id,
      display_name: account.display_name,
      status: "connected",
      scopes: [] as string[],
      credential_reference: `composio://connected-account/${account.account_id}`,
      metadata: {
        source: "composio-sync",
        mode: "managed_oauth",
        broker: "composio",
        validation: {
          verified: true,
          verification_type: "broker_account_active",
          execution_verified: false,
          checked_at: new Date().toISOString(),
        },
        full_scopes: false,
      },
    }));
  return { records, matched: plan.matched, existing: plan.existing, selected: selected.size };
}
