type Account = { id: string; provider: string; status: string; gateway_ready?: boolean };

/** Readiness belongs to an account; an imported stale row cannot hide a usable account. */
export function modelProviderState<T extends Account>(accounts: T[], provider: string) {
  const matching = accounts.filter((account) => account.provider === provider);
  const ready = matching.filter(
    (account) => account.status === "connected" && account.gateway_ready,
  );
  return {
    accounts: matching,
    ready,
    needsReconnect: ready.length === 0 && matching.length > 0,
  };
}

/** Native APIs use their own model names; router APIs retain provider-qualified IDs. */
export function modelForUpstream(resolved: string, provider: string): string {
  const prefixes: Record<string, string> = {
    openai: "openai/",
    google: "google/",
    xai: "x-ai/",
    mistral: "mistralai/",
    deepseek: "deepseek/",
  };
  const prefix = prefixes[provider];
  return prefix && resolved.startsWith(prefix) ? resolved.slice(prefix.length) : resolved;
}
