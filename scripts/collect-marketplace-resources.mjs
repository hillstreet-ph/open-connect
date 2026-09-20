#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  deduplicateCandidates,
  hasSuspiciousMetadata,
  isAllowedCatalogUrl,
  normalizeOpenSlug,
  registryFingerprint,
} from "../src/lib/registry-normalize.ts";

const root = resolve(import.meta.dirname, "..");
const registry = JSON.parse(
  await readFile(resolve(root, "config/marketplace-sources.registry.json"), "utf8"),
);
const outputDir = resolve(root, process.env.MARKETPLACE_OUTPUT_DIR || "audit-results/marketplace");
const publish = process.argv.includes("--publish");
const allowPartial = process.argv.includes("--allow-partial");
const writeCatalog = process.argv.includes("--write-catalog");
const fromCatalog = process.argv.includes("--from-catalog");
const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

function headers() {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "open-connect-marketplace-collector/1.0",
    ...(githubToken ? { Authorization: `Bearer ${githubToken}` } : {}),
  };
}

async function collectSource(source) {
  if (!source.enabled || source.adapter !== "github_repository_search") return [];
  const response = await fetch(source.url, {
    headers: headers(),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`${source.id} returned HTTP ${response.status}`);
  const payload = await response.json();
  return (payload.items || [])
    .slice(0, registry.default_policy.max_items_per_source)
    .filter(
      (item) =>
        !item.archived &&
        isAllowedCatalogUrl(String(item.html_url), registry.default_policy.allowed_hosts),
    )
    .map((item) => {
      const description = item.description ? String(item.description).slice(0, 500) : null;
      const hasLicense = item.license?.spdx_id && item.license.spdx_id !== "NOASSERTION";
      const suspicious = hasSuspiciousMetadata(`${item.name || ""}\n${description || ""}`);
      return {
        sourceId: source.id,
        externalId: String(item.id),
        name: String(item.name || item.full_name),
        canonicalUrl: String(item.html_url),
        description,
        license: item.license?.spdx_id || null,
        updatedAt: item.updated_at || null,
        trust: source.trust,
        categories: [...new Set([...(source.categories || []), ...(item.topics || [])])].slice(
          0,
          12,
        ),
        slug: normalizeOpenSlug(item.full_name || item.name),
        fingerprint: "",
        reviewState: suspicious
          ? "quarantined_metadata"
          : hasLicense
            ? "pending_security_review"
            : "pending_license_review",
        metadata: {
          full_name: item.full_name,
          stars: item.stargazers_count,
          topics: item.topics || [],
          default_branch: item.default_branch,
          archived: Boolean(item.archived),
          fork: Boolean(item.fork),
          owner: item.owner?.login || null,
        },
      };
    });
}

const results = [];
const failures = [];
if (fromCatalog) {
  const catalog = JSON.parse(
    await readFile(resolve(root, "config/marketplace-candidates.generated.json"), "utf8"),
  );
  results.push(...catalog.candidates);
} else {
  for (const source of registry.sources) {
    try {
      results.push(...(await collectSource(source)));
    } catch (error) {
      failures.push({
        sourceId: source.id,
        error: error instanceof Error ? error.message : "collector failed",
      });
    }
  }
}
const candidates = deduplicateCandidates(results).map((candidate) => ({
  ...candidate,
  fingerprint: registryFingerprint(candidate),
}));

const enabledSources = registry.sources.filter((source) => source.enabled).length;
const minimumSources = registry.default_policy.minimum_successful_sources ?? enabledSources;
const minimumCandidates = registry.default_policy.minimum_candidates ?? 1;
const successfulSources = fromCatalog ? enabledSources : enabledSources - failures.length;
if (
  !allowPartial &&
  (successfulSources < minimumSources || candidates.length < minimumCandidates)
) {
  throw new Error(
    `incomplete collection: ${successfulSources}/${enabledSources} sources, ${candidates.length} candidates`,
  );
}

await mkdir(outputDir, { recursive: true });
await writeFile(
  resolve(outputDir, "candidates.json"),
  `${JSON.stringify({ generatedAt: new Date().toISOString(), candidates, failures }, null, 2)}\n`,
);

if (writeCatalog) {
  const catalogPath = resolve(root, "config/marketplace-candidates.generated.json");
  await writeFile(
    catalogPath,
    `${JSON.stringify(
      {
        schema_version: registry.schema_version,
        registry_id: registry.registry_id,
        policy: {
          ingestion_mode: registry.default_policy.ingestion_mode,
          install: false,
          review_required: true,
        },
        candidates,
      },
      null,
      2,
    )}\n`,
  );
}

if (publish) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !serviceKey)
    throw new Error("publish requires broker-injected Supabase credentials");
  const sourceIds = Object.fromEntries(registry.sources.map((source) => [source.id, source]));
  const apiHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates,return=minimal",
  };
  const sourceResponse = await fetch(`${supabaseUrl}/rest/v1/registry_sources?on_conflict=slug`, {
    method: "POST",
    headers: apiHeaders,
    body: JSON.stringify(
      registry.sources.map((source) => ({
        slug: source.id,
        name: source.name,
        adapter: source.adapter,
        base_url: source.catalog_url || source.url,
        trust_level: source.trust,
        enabled: source.enabled,
        config: { discovery_url: source.url },
      })),
    ),
  });
  if (!sourceResponse.ok)
    throw new Error(`registry source upsert failed: HTTP ${sourceResponse.status}`);

  for (const candidate of candidates) {
    const source = sourceIds[candidate.sourceId];
    const lookup = await fetch(
      `${supabaseUrl}/rest/v1/registry_sources?slug=eq.${encodeURIComponent(candidate.sourceId)}&select=id`,
      { headers: apiHeaders },
    );
    const rows = await lookup.json();
    const sourceId = rows[0]?.id;
    if (!sourceId) throw new Error(`registry source missing after upsert: ${candidate.sourceId}`);
    const response = await fetch(
      `${supabaseUrl}/rest/v1/resource_source_records?on_conflict=source_id,external_id`,
      {
        method: "POST",
        headers: apiHeaders,
        body: JSON.stringify({
          source_id: sourceId,
          external_id: candidate.externalId,
          canonical_url: candidate.canonicalUrl,
          normalized_slug: candidate.slug,
          name: candidate.name,
          description: candidate.description,
          license: candidate.license,
          content_hash: candidate.fingerprint,
          review_state: candidate.reviewState,
          source_updated_at: candidate.updatedAt,
          metadata: {
            ...candidate.metadata,
            trust: source.trust,
            categories: candidate.categories,
            ingestion_mode: "metadata_only",
          },
        }),
      },
    );
    if (!response.ok)
      throw new Error(
        `${candidate.sourceId}/${candidate.externalId} upsert failed: HTTP ${response.status}`,
      );
  }
}

console.log(
  JSON.stringify({ candidates: candidates.length, failures, published: publish }, null, 2),
);
