type ManagedAccount = { id: string; provider: string };
type SavedConnection = {
  provider: string;
  provider_account_id: string | null;
  credential_reference: string | null;
};

/** Plan metadata imports only. Account ownership and ACTIVE status are checked by the broker. */
export function planComposioSync(
  accounts: ManagedAccount[],
  saved: SavedConnection[],
  catalog: Array<{ slug: string; name: string }>,
) {
  const existing = new Set<string>();
  for (const connection of saved) {
    const accountId = connection.credential_reference?.match(
      /^composio:\/\/connected-account\/([^/]+)$/,
    )?.[1];
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
