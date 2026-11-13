export const SUPPORTED_RESOURCE_LICENSES = [
  "proprietary",
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "MPL-2.0",
  "GPL-2.0-only",
  "GPL-3.0-only",
  "AGPL-3.0-only",
  "Unlicense",
] as const;

export function normalizeResourceLicense(value: unknown): string {
  if (typeof value !== "string") return "proprietary";
  const license = value.trim();
  return (SUPPORTED_RESOURCE_LICENSES as readonly string[]).includes(license)
    ? license
    : "proprietary";
}
