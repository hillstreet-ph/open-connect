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
