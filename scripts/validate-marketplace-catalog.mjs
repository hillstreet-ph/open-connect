#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { canonicalizeUrl, isAllowedCatalogUrl } from "../src/lib/registry-normalize.ts";

const root = resolve(import.meta.dirname, "..");
const registry = JSON.parse(
  await readFile(resolve(root, "config/marketplace-sources.registry.json"), "utf8"),
);
const catalog = JSON.parse(
  await readFile(resolve(root, "config/marketplace-candidates.generated.json"), "utf8"),
);

if (catalog.policy?.ingestion_mode !== "metadata_only" || catalog.policy?.install !== false) {
  throw new Error("catalog must remain metadata-only and non-installing");
}
if (!Array.isArray(catalog.candidates)) throw new Error("catalog candidates must be an array");
if (catalog.candidates.length < registry.default_policy.minimum_candidates) {
  throw new Error(`catalog has only ${catalog.candidates.length} candidates`);
}

const urls = new Set();
const sourceIds = new Set(registry.sources.map((source) => source.id));
const allowedReviewStates = new Set([
  "pending_license_review",
  "pending_security_review",
  "quarantined_metadata",
]);
for (const candidate of catalog.candidates) {
  if (!sourceIds.has(candidate.sourceId)) throw new Error(`unknown source: ${candidate.sourceId}`);
  if (!isAllowedCatalogUrl(candidate.canonicalUrl, registry.default_policy.allowed_hosts)) {
    throw new Error(`disallowed catalog URL: ${candidate.canonicalUrl}`);
  }
  if (!allowedReviewStates.has(candidate.reviewState)) {
    throw new Error(`unsafe review state: ${candidate.reviewState}`);
  }
  const url = canonicalizeUrl(candidate.canonicalUrl);
  if (urls.has(url)) throw new Error(`duplicate catalog URL: ${url}`);
  urls.add(url);
}

console.log(JSON.stringify({ ok: true, candidates: catalog.candidates.length }));
