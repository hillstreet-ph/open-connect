type KobePlayMarketplaceCandidate = {
  slug: string;
  name: string;
  description?: string | null;
  category_slug?: string | null;
  supported_clients?: string[] | null;
};

/** Match Marketplace entries connected to KobePlay's requested apps and AI clients. */
export function isKobePlayMarketplaceResource(resource: KobePlayMarketplaceCandidate): boolean {
  const targetPattern =
    /(^|[^a-z0-9])(openai|chatgpt|openai compatible|airtable|notion|gmail|google (drive|docs?|documents?|sheets?|spreadsheets?|workspace|accounts?))([^a-z0-9]|$)/;
  const normalize = (value: string) => value.toLowerCase().replace(/[_-]+/g, " ");
  if ((resource.supported_clients ?? []).some((client) => targetPattern.test(normalize(client)))) {
    return true;
  }
  if (targetPattern.test(normalize(resource.category_slug ?? ""))) return true;

  const searchable = normalize(`${resource.slug} ${resource.name} ${resource.description ?? ""}`);
  return targetPattern.test(searchable);
}
