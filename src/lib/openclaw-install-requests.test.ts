import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");

type Package = {
  slug: string;
  kind: string;
  install_command: string;
  source_ref: string;
  source_type: string;
  canonical_url: string | null;
  license: string | null;
  risk: string;
  state: string;
  review_reason: string;
};

type Registry = {
  policy: {
    mode: string;
    install_commands_executed_by_ci: boolean;
    auto_install: boolean;
    auto_publish: boolean;
    executable: boolean;
    require_license: boolean;
    require_security_review: boolean;
    allowed_states: string[];
  };
  resolution: Record<string, string>;
  packages: Package[];
  duplicate_requests: Array<{
    source_ref: string;
    occurrences: number;
    consolidated_into: string;
    reason: string;
  }>;
};

const registry = JSON.parse(
  readFileSync(resolve(root, "config/openclaw-install-requests.registry.json"), "utf8"),
) as Registry;

test("openclaw install requests stay metadata-only and never auto-install", () => {
  assert.equal(registry.policy.mode, "metadata_only");
  assert.equal(registry.policy.install_commands_executed_by_ci, false);
  assert.equal(registry.policy.auto_install, false);
  assert.equal(registry.policy.auto_publish, false);
  assert.equal(registry.policy.executable, false);
  assert.equal(registry.policy.require_license, true);
  assert.equal(registry.policy.require_security_review, true);
});

test("every requested package records an exact openclaw install command", () => {
  assert.ok(registry.packages.length >= 80, "expected the full requested install batch");
  const slugs = new Set<string>();
  for (const pkg of registry.packages) {
    assert.match(pkg.slug, /^open-oc-(plugin|skill)-[a-z0-9-]+$/, `bad slug: ${pkg.slug}`);
    assert.ok(!slugs.has(pkg.slug), `duplicate slug: ${pkg.slug}`);
    slugs.add(pkg.slug);
    assert.ok(["plugin", "skill"].includes(pkg.kind), `bad kind: ${pkg.slug}`);
    assert.equal(
      pkg.install_command,
      `openclaw ${pkg.kind === "plugin" ? "plugins" : "skills"} install ${pkg.source_ref}`,
      `install command mismatch: ${pkg.slug}`,
    );
    assert.ok(
      [
        "clawhub_registry",
        "openclaw_registry_package_name",
        "github_repository",
        "skills_sh",
      ].includes(pkg.source_type),
      `unknown source type: ${pkg.slug}`,
    );
    assert.equal(pkg.canonical_url === null, pkg.source_type === "openclaw_registry_package_name");
    if (pkg.canonical_url)
      assert.ok(pkg.canonical_url.startsWith("https://"), `non-HTTPS url: ${pkg.slug}`);
    assert.ok(
      ["low", "medium", "high", "critical"].includes(pkg.risk),
      `unknown risk: ${pkg.slug}`,
    );
    assert.equal(pkg.state, "review_required", `request must start in review: ${pkg.slug}`);
    assert.ok(pkg.review_reason.length > 0, `missing review reason: ${pkg.slug}`);
  }
});

test("canonical URLs follow the documented resolution rules", () => {
  for (const pkg of registry.packages) {
    if (pkg.source_type === "clawhub_registry") {
      const [owner, name] = pkg.source_ref.split("/");
      assert.equal(
        pkg.canonical_url,
        `https://clawhub.ai/${owner}/${pkg.kind === "plugin" ? "plugins" : "skills"}/${name}`,
        `unresolved ClawHub reference: ${pkg.slug}`,
      );
    } else if (pkg.source_type === "github_repository") {
      assert.equal(
        pkg.canonical_url,
        `https://github.com/${pkg.source_ref}`,
        `unresolved GitHub reference: ${pkg.slug}`,
      );
    } else if (pkg.source_type === "skills_sh") {
      assert.equal(
        pkg.canonical_url,
        `https://skills.sh/${pkg.source_ref}`,
        `unresolved skills.sh reference: ${pkg.slug}`,
      );
    }
  }
  assert.ok(registry.resolution.clawhub_registry, "resolution rules must be documented");
});

test("duplicate install requests are consolidated into one catalog entry", () => {
  const byRef = new Map<string, Package>();
  for (const pkg of registry.packages) byRef.set(pkg.source_ref, pkg);
  for (const duplicate of registry.duplicate_requests) {
    assert.ok(
      duplicate.occurrences >= 2,
      `duplicate must occur at least twice: ${duplicate.source_ref}`,
    );
    assert.equal(duplicate.reason, "duplicate_request_consolidated");
    const canonical = byRef.get(duplicate.source_ref);
    assert.ok(canonical, `missing consolidated entry for ${duplicate.source_ref}`);
    assert.equal(duplicate.consolidated_into, canonical.slug);
  }
});
