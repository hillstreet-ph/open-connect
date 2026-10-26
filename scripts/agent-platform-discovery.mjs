import { createHash } from "node:crypto";

// Discovery reads Git object metadata only. It never downloads or executes packages.
export function platformCandidates(source, repository, tree) {
  if (tree.truncated) throw new Error(`${source.id}: incomplete GitHub tree`);
  if (!repository.id || !repository.full_name || !repository.default_branch || !tree.sha) {
    throw new Error(`${source.id}: missing repository revision or identity`);
  }
  if (repository.archived) throw new Error(`${source.id}: source repository is archived`);
  const entries = (tree.tree || []).filter(
    (item) =>
      item.type === "blob" &&
      /(?:^|\/)(?:SKILL\.md|plugin\.json|\.mcp\.json|mcp\.json)$/i.test(item.path) &&
      !/(?:^|\/)(?:node_modules|\.git|\.venv|vendor)(?:\/|$)/.test(item.path),
  );
  if (entries.length > (source.max_items || 2000)) {
    throw new Error(`${source.id}: resource limit exceeded; refusing partial snapshot`);
  }
  if (!entries.length) throw new Error(`${source.id}: no resource manifests discovered`);
  return entries.map((item) => {
    if (!item.sha || !item.path || item.path.split("/").some((p) => p === "..")) {
      throw new Error(`${source.id}: invalid resource metadata`);
    }
    const externalId = `${repository.id}:${item.path}`;
    const identity = createHash("sha256").update(externalId).digest("hex").slice(0, 16);
    const skill = /SKILL\.md$/i.test(item.path);
    const type = skill ? "skill" : /plugin\.json$/i.test(item.path) ? "plugin" : "mcp";
    const name = item.path.split("/").slice(0, -1).join("/") || repository.name;
    const license = repository.license?.spdx_id;
    return {
      sourceId: source.id,
      externalId,
      name: `${repository.full_name}: ${name}`,
      canonicalUrl: `https://github.com/${repository.full_name}/blob/${encodeURIComponent(repository.default_branch)}/${item.path.split("/").map(encodeURIComponent).join("/")}`,
      description: `Upstream ${type} manifest at ${item.path}. Content, license applicability and runtime compatibility require review.`,
      license: license && license !== "NOASSERTION" ? license : null,
      updatedAt: repository.pushed_at || null,
      trust: source.trust,
      categories: [...new Set([...(source.categories || []), type])],
      slug: `open-platform-${identity}`,
      fingerprint: "",
      revision: item.sha,
      reviewState: "pending_license_review",
      metadata: {
        resource_type: type,
        repository: repository.full_name,
        repository_id: repository.id,
        path: item.path,
        blob_sha: item.sha,
        tree_sha: tree.sha,
        ingestion_mode: "metadata_only",
        // A repository-level license does not establish a subpackage's license.
        license_scope: "repository_only_unreviewed",
      },
    };
  });
}

export function mergePlatformSnapshot(previous, fresh, sourceIds) {
  const selected = new Set(sourceIds);
  return [...previous.filter((row) => !selected.has(row.sourceId)), ...fresh];
}

export function deduplicatePlatformCandidates(rows) {
  const byBlob = new Map();
  const others = [];
  for (const row of rows) {
    if (!row.metadata?.blob_sha) {
      others.push(row);
      continue;
    }
    const key = `${row.metadata.resource_type}:${row.metadata.blob_sha}`;
    const existing = byBlob.get(key);
    if (!existing) {
      byBlob.set(key, row);
      continue;
    }
    const winner =
      row.trust === "official_upstream" && existing.trust !== "official_upstream" ? row : existing;
    const aliases = [
      ...(existing.metadata.source_aliases || []),
      ...(row.metadata.source_aliases || []),
      { source_id: existing.sourceId, url: existing.canonicalUrl },
      { source_id: row.sourceId, url: row.canonicalUrl },
    ];
    byBlob.set(key, {
      ...winner,
      metadata: {
        ...winner.metadata,
        source_aliases: [...new Map(aliases.map((alias) => [alias.url, alias])).values()].sort(
          (a, b) => a.url.localeCompare(b.url),
        ),
      },
    });
  }
  return [...others, ...byBlob.values()];
}
