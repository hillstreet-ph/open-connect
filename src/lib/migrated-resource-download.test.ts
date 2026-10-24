import assert from "node:assert/strict";
import test from "node:test";
import { migratedResourceDownload } from "./migrated-resource-download.ts";

const resource = {
  slug: "github-e2e-setup",
  source_url: "https://github.com/hillstreet-ph/open-custom-skills",
  verified: true,
  published: true,
} as const;
const registry = {
  "github-e2e-setup": {
    path: "resources/migrated/custom-skills/archives/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/github-e2e-setup.zip",
    sha256: "a".repeat(64),
  },
};

test("migrated source downloads use the canonical repository and preserve original filename", () => {
  const result = migratedResourceDownload(resource, registry);
  assert.equal(result?.filename, "github-e2e-setup.zip");
  assert.equal(
    result?.url,
    "https://raw.githubusercontent.com/hillstreet-ph/open-connect/main/resources/migrated/custom-skills/archives/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/github-e2e-setup.zip",
  );
  assert.equal(result?.sha256, "a".repeat(64));
});

test("unreviewed, private and unrelated resources keep their existing download behavior", () => {
  for (const overrides of [
    { verified: false },
    { published: false },
    { source_url: "https://example.com" },
    { slug: "missing" },
  ])
    assert.equal(migratedResourceDownload({ ...resource, ...overrides }, registry), null);
});

test("registry cannot redirect downloads outside the migrated artifact directory", () => {
  for (const path of [
    "https://evil.test/key",
    "resources/migrated/../../secret",
    "resources/migrated/custom-skills/archives/run.sh",
  ])
    assert.throws(
      () =>
        migratedResourceDownload(resource, { [resource.slug]: { path, sha256: "a".repeat(64) } }),
      /Invalid/,
    );
});

test("downloads keep each content revision isolated", () => {
  const old = migratedResourceDownload(resource, registry);
  const next = migratedResourceDownload(resource, {
    [resource.slug]: {
      path: "resources/migrated/custom-skills/archives/" + "b".repeat(64) + "/github-e2e-setup.zip",
      sha256: "b".repeat(64),
    },
  });
  assert.notEqual(old?.url, next?.url);
  assert.throws(
    () =>
      migratedResourceDownload(resource, {
        [resource.slug]: {
          ...registry[resource.slug],
          sha256: "b".repeat(64),
        },
      }),
    /Invalid/,
  );
});
