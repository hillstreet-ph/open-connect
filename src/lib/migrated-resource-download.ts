import { resourceConfig } from "./resource-approval.ts";
type MigratedPackages = Record<string, { path: string; sha256: string }>;

/** Only reviewed legacy catalog entries may use the canonical migrated package. */
export function migratedResourceDownload(
  resource: {
    slug: string;
    source_url: string | null;
    verified: boolean;
    published: boolean;
    installation_config?: unknown;
  },
  packages: MigratedPackages,
) {
  if (
    !resource.verified ||
    !resource.published ||
    resource.source_url !== "https://github.com/hillstreet-ph/open-custom-skills"
  )
    return null;
  const config = resourceConfig(resource.installation_config);
  if (Object.hasOwn(config, "review_state") && config["review_state"] !== "approved") return null;
  const artifact = Object.hasOwn(packages, resource.slug) ? packages[resource.slug] : undefined;
  if (!artifact) return null;
  const versionedPath =
    /^resources\/migrated\/custom-skills\/archives\/([a-f0-9]{64})\/[a-z0-9-]+\.(?:zip|pdf)$/.exec(
      artifact.path,
    );
  if (
    !versionedPath ||
    versionedPath[1] !== artifact.sha256 ||
    !/^[a-f0-9]{64}$/.test(artifact.sha256)
  )
    throw new Error("Invalid migrated resource artifact");
  return {
    kind: "url" as const,
    url: `https://raw.githubusercontent.com/hillstreet-ph/open-connect/main/${artifact.path}`,
    filename: artifact.path.split("/").at(-1)!,
    sha256: artifact.sha256,
  };
}
