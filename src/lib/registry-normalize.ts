export type RegistryCandidate = {
  sourceId: string;
  externalId: string;
  name: string;
  canonicalUrl: string;
  description?: string | null;
  license?: string | null;
  updatedAt?: string | null;
  trust?: string;
};

export function canonicalizeUrl(value: string): string {
  const url = new URL(value.trim());
  url.hash = "";
  url.search = "";
  url.hostname = url.hostname.toLowerCase();
  url.pathname = url.pathname.replace(/\/+$/, "").replace(/\.git$/i, "");
  return url.toString().replace(/\/$/, "");
}

export function normalizeOpenSlug(value: string): string {
  const body = value
    .trim()
    .toLowerCase()
    .replace(/^open[-_\s]+/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return `open-${body || "resource"}`;
}

export function registryFingerprint(candidate: RegistryCandidate): string {
  const input = [candidate.sourceId, candidate.externalId, canonicalizeUrl(candidate.canonicalUrl)]
    .join("|")
    .toLowerCase();
  let hash = 2166136261;
  for (const char of input) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function deduplicateCandidates(candidates: RegistryCandidate[]): RegistryCandidate[] {
  const byUrl = new Map<string, RegistryCandidate>();
  for (const candidate of candidates) {
    const canonicalUrl = canonicalizeUrl(candidate.canonicalUrl);
    const existing = byUrl.get(canonicalUrl);
    if (!existing || Date.parse(candidate.updatedAt || "") > Date.parse(existing.updatedAt || "")) {
      byUrl.set(canonicalUrl, { ...candidate, canonicalUrl });
    }
  }
  return [...byUrl.values()].sort((a, b) => a.canonicalUrl.localeCompare(b.canonicalUrl));
}
