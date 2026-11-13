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

/** Preserve exact account bindings, including native vault connections linked to a broker account. */
function savedAccount(account: ManagedAccount, saved: SavedConnection[]) {
  return (
    saved.find((connection) => brokerAccountId(connection) === account.id) ??
    saved.find(
      (connection) =>
        connection.provider === account.provider && connection.provider_account_id === account.id,
    )
  );
}

/**
 * Composio AI-provider toolkits sync under their Open-Connect AI Gateway provider
 * ID so gateway cards and connectors share one provider. Connections flow one
 * way: users authorize in Composio, then Open-Connect imports them by sync.
 */
const GATEWAY_PROVIDER_BY_SLUG: Record<string, { id: string; name: string }> = {
  openai: { id: "openai", name: "OpenAI" },
  anthropic: { id: "anthropic", name: "Anthropic / Claude" },
  gemini: { id: "google", name: "Google / Gemini" },
  mistral: { id: "mistral", name: "Mistral" },
  mistral_ai: { id: "mistral", name: "Mistral" },
  deepseek: { id: "deepseek", name: "DeepSeek" },
  groq: { id: "groq", name: "Groq" },
  groqcloud: { id: "groq", name: "Groq" },
  grok: { id: "xai", name: "xAI / Grok" },
  xai: { id: "xai", name: "xAI / Grok" },
  x_ai: { id: "xai", name: "xAI / Grok" },
  hugging_face: { id: "huggingface", name: "Hugging Face" },
  huggingface: { id: "huggingface", name: "Hugging Face" },
  nvidia: { id: "nvidia", name: "NVIDIA NIM" },
  nvidia_nim: { id: "nvidia", name: "NVIDIA NIM" },
  nim: { id: "nvidia", name: "NVIDIA NIM" },
  openrouter: { id: "openrouter", name: "OpenRouter" },
  ollama: { id: "ollama_cloud", name: "Ollama Cloud" },
  ollama_cloud: { id: "ollama_cloud", name: "Ollama Cloud" },
  kilocode: { id: "kilo", name: "Kilo Code Gateway" },
  kilo: { id: "kilo", name: "Kilo Code Gateway" },
};

/** Plan metadata imports only. Account ownership and ACTIVE status are checked by the broker. */
export function planComposioSync(
  accounts: ManagedAccount[],
  saved: SavedConnection[],
  catalog: Array<{ slug: string; name: string }>,
) {
  const labels = new Map(catalog.map((item) => [item.slug, item.name]));
  const unique = new Map(accounts.map((account) => [account.id, account]));
  const candidates = [...unique.values()]
    .filter((account) => !savedAccount(account, saved))
    .map((account) => {
      const gateway = GATEWAY_PROVIDER_BY_SLUG[account.provider];
      return {
        account_id: account.id,
        provider: gateway?.id ?? account.provider,
        display_name: gateway?.name ?? labels.get(account.provider) ?? account.provider,
      };
    });
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
  const unique = new Map(accounts.map((account) => [account.id, account]));
  const connections = [...unique.values()].map((account) => {
    const connection = savedAccount(account, saved);
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

/** Website sync-all retains bounded batches while the MCP selection stays limited to 100 IDs. */
export function composioImportBatches(
  userId: string,
  accounts: ManagedAccount[],
  saved: SavedConnection[],
  catalog: Array<{ slug: string; name: string }>,
) {
  const plan = planComposioSync(accounts, saved, catalog);
  const batches = [];
  for (let offset = 0; offset < plan.candidates.length; offset += 100) {
    batches.push(
      composioImportRecords(
        userId,
        accounts,
        saved,
        catalog,
        plan.candidates.slice(offset, offset + 100).map((account) => account.account_id),
      ).records,
    );
  }
  return { batches, matched: plan.matched, existing: plan.existing };
}
