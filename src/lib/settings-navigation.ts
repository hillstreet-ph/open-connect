const settingsTabs = ["profile", "security", "data", "integrations"] as const;
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
