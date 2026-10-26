export const BROWSER_PROVIDERS = [
  {
    id: "tinyfish",
    name: "TinyFish",
    description: "Autonomous tasks, saved profiles and direct control.",
  },
  { id: "browser_use", name: "Browser Use", description: "V4 prompt agent with a $1 run cap." },
  { id: "browserbase", name: "Browserbase", description: "Manual cloud browser sessions." },
  {
    id: "playwright",
    name: "Playwright MCP",
    description: "Snapshots, forms, clicks, screenshots and tabs through a connected worker.",
  },
  {
    id: "stagehand",
    name: "Stagehand",
    description:
      "Natural-language actions, observations and extraction through a connected worker.",
  },
  {
    id: "chrome_devtools",
    name: "Chrome DevTools",
    description:
      "Browser diagnostics, network inspection and performance tools through a connected worker.",
  },
  {
    id: "external",
    name: "Connected tools",
    description: "Playwright, Stagehand and other connected browser tools.",
  },
  {
    id: "tinyfish_tools",
    name: "TinyFish research tools",
    description: "Search, fetch, research and monitoring through a connected TinyFish worker.",
  },
  {
    id: "verification",
    name: "Verification tools",
    description: "Discover supported verification tools and same-session handoff requirements.",
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

/** One surface per provider; worker adapters share one connected-tools explorer. */
export const BROWSER_PRIMARY_PROVIDERS = BROWSER_PROVIDERS.filter((item) =>
  ["tinyfish", "browser_use", "browserbase", "external"].includes(item.id),
);
export function browserProviderSurface(provider: BrowserProviderId) {
  return provider === "tinyfish" || provider === "browser_use" || provider === "browserbase"
    ? provider
    : "external";
}

export function browserProvider(value: unknown): BrowserProviderId {
  if (value === "verification") return "tinyfish"; // Migrated to the shared global service.
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

/** Capabilities implemented by this adapter, rather than the vendor's entire catalog. */
export const BROWSER_ADAPTER_CAPABILITIES = {
  tinyfish: {
    available: [
      "Prompt tasks",
      "Saved profiles and cookies",
      "Live view",
      "Direct browser controls",
      "Run history and cancellation",
    ],
    setup:
      "Use Profiles for secure sign-in setup. A saved cookie does not guarantee an active login.",
  },
  browser_use: {
    available: [
      "V4 prompt tasks",
      "$1 maximum cost per run",
      "Live view while running",
      "Result validation",
      "Cancellation and browser cleanup",
    ],
    setup:
      "This adapter does not yet attach persistent login profiles. Use a fresh task or the provider's supported sign-in flow.",
  },
  browserbase: {
    available: [
      "Five-minute manual sessions",
      "Live browser view",
      "Session status",
      "Explicit release and cleanup",
    ],
    setup:
      "This adapter opens a manual browser. Prompt execution, saved contexts and proxies require separate integration. Supported CAPTCHA solving can be requested when creating a session.",
  },
} as const;

export const BROWSER_WORKERS = {
  playwright: {
    source: "https://github.com/microsoft/playwright-mcp",
    setup:
      "Connect your authenticated HTTPS Playwright MCP worker in Connections. Local stdio tools need a remote HTTP bridge for this cloud app.",
  },
  stagehand: {
    source: "https://github.com/browserbase/stagehand",
    setup:
      "Connect an authenticated worker exposing your Stagehand SDK tools. The SDK and its model connection run in that worker.",
  },
  chrome_devtools: {
    source: "https://github.com/ChromeDevTools/chrome-devtools-mcp",
    setup:
      "Connect an authenticated Chrome DevTools MCP worker. Registering a local Codex stdio server does not create a hosted cloud connection.",
  },
} as const;
export type BrowserToolFamily = keyof typeof BROWSER_WORKERS | "tinyfish" | "captcha";
export function browserToolFamily(provider: BrowserProviderId): BrowserToolFamily | undefined {
  if (provider === "tinyfish_tools") return "tinyfish";
  if (provider === "verification") return "captcha";
  if (provider === "playwright" || provider === "stagehand" || provider === "chrome_devtools")
    return provider;
  return undefined;
}

export function browserFamilyTool(family: BrowserToolFamily, name: string) {
  const value = name.toLowerCase();
  if (family === "playwright") return /(?:^|_)browser_/.test(value);
  if (family === "stagehand")
    return /(?:^|_)(?:act|observe|extract|agent|navigate)(?:_|$)/.test(value);
  if (family === "tinyfish") return /research|search|fetch|monitor/.test(value);
  if (family === "captcha") return /captcha|turnstile|challenge/.test(value);
  return CHROME_DEVTOOLS_TOOLS.some((tool) => value === tool || value.endsWith(`_${tool}`));
}

export const CHROME_DEVTOOLS_TOOLS = [
  "click",
  "close_page",
  "drag",
  "emulate",
  "evaluate_script",
  "fill",
  "fill_form",
  "get_console_message",
  "get_css_styles",
  "get_network_request",
  "handle_dialog",
  "hover",
  "lighthouse_audit",
  "list_console_messages",
  "list_network_requests",
  "list_pages",
  "navigate_page",
  "new_page",
  "performance_analyze_insight",
  "performance_start_trace",
  "performance_stop_trace",
  "press_key",
  "resize_page",
  "screencast_start",
  "screencast_stop",
  "select_page",
  "take_heapsnapshot",
  "take_screenshot",
  "take_snapshot",
  "type_text",
  "upload_file",
  "wait_for",
] as const;
