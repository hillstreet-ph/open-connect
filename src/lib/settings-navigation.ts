const settingsTabs = ["profile", "security", "data"] as const;

/** One hub for developer access and integrations (Settings keeps personal tabs only). */
export const developerSections = [
  "api-key",
  "oauth-apps",
  "authorized-apps",
  "webhooks",
  "apps",
] as const;
export type DeveloperSection = (typeof developerSections)[number];
export function developerSection(value: unknown): DeveloperSection {
  return typeof value === "string" && developerSections.includes(value as DeveloperSection)
    ? (value as DeveloperSection)
    : "api-key";
}
/** Old Settings → Integrations deep links move to the hub's Webhooks section. */
export function legacySettingsRedirect(hash: string): DeveloperSection | null {
  return hash.replace(/^#/, "") === "integrations" ? "webhooks" : null;
}
export function settingsTabList(): readonly string[] {
  return settingsTabs;
}
export function settingsTab(hash: string): string {
  const tab = hash.replace(/^#/, "");
  return settingsTabs.some((value) => value === tab) ? tab : "profile";
}

const adminTabs = ["organization", "access"] as const;
export type AdminTab = (typeof adminTabs)[number];
export function adminTab(value: string): AdminTab {
  const tab = value.replace(/^#/, "");
  // Legacy "#roles" deep links fold into the merged people-and-roles surface.
  if (tab === "roles") return "organization";
  return adminTabs.some((candidate) => candidate === tab) ? (tab as AdminTab) : "organization";
}
