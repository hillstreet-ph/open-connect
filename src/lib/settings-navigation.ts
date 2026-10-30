const settingsTabs = [
  "profile",
  "security",
  "workspace",
  "apps",
  "data",
  "integrations",
  "approvals",
] as const;
export function settingsTab(hash: string): string {
  const tab = hash.replace(/^#/, "");
  return settingsTabs.some((value) => value === tab) ? tab : "profile";
}

const adminTabs = ["roles", "organization", "access"] as const;
export type AdminTab = (typeof adminTabs)[number];
export function adminTab(value: string): AdminTab {
  const tab = value.replace(/^#/, "");
  return adminTabs.some((candidate) => candidate === tab) ? (tab as AdminTab) : "organization";
}
