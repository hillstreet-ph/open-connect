export const BROWSER_PROVIDERS = [
  {
    id: "tinyfish",
    name: "TinyFish",
    description: "Autonomous tasks, saved profiles and direct control.",
  },
  { id: "browser_use", name: "Browser Use", description: "V4 prompt agent with a $1 run cap." },
  { id: "browserbase", name: "Browserbase", description: "Manual cloud browser sessions." },
  {
    id: "external",
    name: "Connected tools",
    description: "Playwright, Stagehand and other connected browser tools.",
  },
  {
    id: "browseract",
    name: "BrowserAct",
    description: "Requires a verified browser worker; local CLI is not a cloud connection.",
  },
  {
    id: "multion",
    name: "MultiOn",
    description: "Requires a verified current provider API and account.",
  },
] as const;
export type BrowserProviderId = (typeof BROWSER_PROVIDERS)[number]["id"];
export function browserProvider(value: unknown): BrowserProviderId {
  return BROWSER_PROVIDERS.some((item) => item.id === value)
    ? (value as BrowserProviderId)
    : "tinyfish";
}
export function providerStorageKey(userId: string, provider: "browser_use" | "browserbase") {
  return `oc-browser-provider:${userId}:${provider}`;
}
export function providerConnectionStatus(
  provider: "tinyfish" | "browser_use" | "browserbase",
  connections: Array<{ provider: string; status: string; credential_reference: string | null }>,
  deploymentKey = false,
) {
  const aliases =
    provider === "tinyfish"
      ? ["tinyfish", "custom_tinyfish_mcp"]
      : provider === "browserbase"
        ? ["browserbase", "browserbase_tool", "browserbase_mcp"]
        : [provider];
  const matching = connections.filter(
    (item) => aliases.includes(item.provider) && item.status === "connected",
  );
  const native =
    matching.some(
      (item) =>
        (provider === "tinyfish" || item.provider === provider) &&
        item.credential_reference?.startsWith("credential://"),
    ) || deploymentKey;
  const brokered = matching.some((item) => item.credential_reference?.startsWith("composio://"));
  return {
    configured:
      native ||
      (provider === "tinyfish" &&
        matching.some(
          (item) =>
            item.provider === "tinyfish" && item.credential_reference?.startsWith("composio://"),
        )),
    native,
    brokered,
  };
}

/** Move only the matching provider's old tab reference; never consume another provider's run. */
export function restoreProviderReference<T extends { provider: string }>(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
  userId: string,
  provider: "browser_use" | "browserbase",
): T | null {
  const key = providerStorageKey(userId, provider);
  const current = storage.getItem(key);
  if (current) {
    const parsed = JSON.parse(current);
    return parsed?.provider === provider ? (parsed as T) : null;
  }
  const legacyKey = `oc-browser-provider:${userId}`;
  const legacy = storage.getItem(legacyKey);
  if (!legacy) return null;
  const parsed = JSON.parse(legacy);
  if (parsed?.provider !== provider) return null;
  storage.setItem(key, legacy);
  storage.removeItem(legacyKey);
  return parsed as T;
}
