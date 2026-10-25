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
