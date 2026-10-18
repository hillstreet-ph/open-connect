#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  canonicalizeUrl,
  hasSuspiciousMetadata,
  isAllowedCatalogUrl,
  registryFingerprint,
} from "../src/lib/registry-normalize.ts";

const root = resolve(import.meta.dirname, "..");
const registry = JSON.parse(
  await readFile(resolve(root, "config/marketplace-sources.registry.json"), "utf8"),
);
const catalog = JSON.parse(
  await readFile(resolve(root, "config/marketplace-candidates.generated.json"), "utf8"),
);

if (catalog.schema_version !== registry.schema_version || catalog.registry_id !== registry.registry_id) {
  throw new Error("catalog schema or registry identity differs from source registry");
}
if (
  catalog.policy?.ingestion_mode !== "metadata_only" ||
  catalog.policy?.install !== false ||
  catalog.policy?.review_required !== true ||
  registry.default_policy?.publish !== false ||
  registry.default_policy?.install !== false ||
  registry.default_policy?.require_license !== true ||
  registry.default_policy?.require_security_review !== true
) {
  throw new Error("catalog discovery must remain non-installing, non-publishing, and review-gated");
}
if (!Array.isArray(catalog.candidates)) throw new Error("catalog candidates must be an array");
if (catalog.candidates.length < registry.default_policy.minimum_candidates) {
  throw new Error(`catalog has only ${catalog.candidates.length} candidates`);
}

const urls = new Set();
const slugs = new Set();
const perSource = new Map();
const sourcesById = new Map(registry.sources.map((source) => [source.id, source]));
const allowedReviewStates = new Set([
  "pending_license_review",
  "pending_security_review",
  "quarantined_metadata",
]);
let unresolvedLicenses = 0;
let missingDescriptions = 0;

for (const candidate of catalog.candidates) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new Error("candidate must be an object");
  }
  for (const field of ["sourceId", "externalId", "name", "canonicalUrl", "slug", "fingerprint", "trust", "reviewState"]) {
    if (typeof candidate[field] !== "string" || !candidate[field].trim()) {
      throw new Error(`candidate missing required string field ${field}`);
    }
  }
  if (!/^open-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(candidate.slug)) {
    throw new Error(`invalid catalog slug: ${candidate.slug}`);
  }
  if (!Array.isArray(candidate.categories) || candidate.categories.some((value) => typeof value !== "string")) {
    throw new Error(`invalid catalog categories: ${candidate.slug}`);
  }
  if (typeof candidate.updatedAt !== "string" || !Number.isFinite(Date.parse(candidate.updatedAt))) {
    throw new Error(`invalid catalog update timestamp: ${candidate.slug}`);
  }
  if (!candidate.metadata || typeof candidate.metadata !== "object" || Array.isArray(candidate.metadata)) {
    throw new Error(`invalid catalog metadata: ${candidate.slug}`);
  }
  const source = sourcesById.get(candidate.sourceId);
  if (!source || source.enabled === false || source.trust !== candidate.trust) {
    throw new Error(`unknown, disabled, or trust-mismatched source: ${candidate.sourceId}`);
  }
  const allowedHosts = source.allowed_result_hosts || registry.default_policy.allowed_hosts;
  if (!isAllowedCatalogUrl(candidate.canonicalUrl, allowedHosts)) {
    throw new Error(`disallowed catalog URL: ${candidate.canonicalUrl}`);
  }
  if (!allowedReviewStates.has(candidate.reviewState)) {
    throw new Error(`unsafe review state: ${candidate.reviewState}`);
  }
  if (candidate.verified === true || candidate.executable === true ||
      candidate.installable === true || candidate.publishable === true) {
    throw new Error(`unreviewed catalog candidate claims verification or execution: ${candidate.slug}`);
  }
  const unresolved = !candidate.license || candidate.license === "NOASSERTION";
  if (unresolved && candidate.reviewState !== "pending_license_review" &&
      candidate.reviewState !== "quarantined_metadata") {
    throw new Error(`unresolved license progressed past license review: ${candidate.slug}`);
  }
  if (unresolved) unresolvedLicenses += 1;
  if (!candidate.description?.trim()) missingDescriptions += 1;
  if (hasSuspiciousMetadata(`${candidate.name}\n${candidate.description ?? ""}`) &&
      candidate.reviewState !== "quarantined_metadata") {
    throw new Error(`suspicious metadata is not quarantined: ${candidate.slug}`);
  }
  if (!/^[a-f0-9]{8}$/.test(candidate.fingerprint) ||
      registryFingerprint(candidate) !== candidate.fingerprint) {
    throw new Error(`catalog fingerprint mismatch: ${candidate.slug}`);
  }
  const url = canonicalizeUrl(candidate.canonicalUrl);
  if (urls.has(url)) throw new Error(`duplicate catalog URL: ${url}`);
  if (slugs.has(candidate.slug)) throw new Error(`duplicate catalog slug: ${candidate.slug}`);
  urls.add(url);
  slugs.add(candidate.slug);
  perSource.set(candidate.sourceId, (perSource.get(candidate.sourceId) || 0) + 1);
  if (perSource.get(candidate.sourceId) > registry.default_policy.max_items_per_source) {
    throw new Error(`source exceeds candidate cap: ${candidate.sourceId}`);
  }
}
if (perSource.size < registry.default_policy.minimum_successful_sources) {
  throw new Error(`only ${perSource.size} distinct sources, below minimum`);
}

console.log(JSON.stringify({
  ok: true,
  candidates: catalog.candidates.length,
  sources: perSource.size,
  unresolved_licenses: unresolvedLicenses,
  missing_optional_descriptions: missingDescriptions,
  review_required: true,
  executable_candidates: 0,
}));
