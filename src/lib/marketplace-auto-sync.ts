type OpenAiMarketplaceCandidate = {
  slug: string;
  name: string;
  description?: string | null;
  category_slug?: string | null;
  supported_clients?: string[] | null;
};

/** Match explicit OpenAI/ChatGPT metadata as well as clearly named catalog entries. */
export function isOpenAiMarketplaceResource(resource: OpenAiMarketplaceCandidate): boolean {
  const clients = (resource.supported_clients ?? []).map((client) => client.toLowerCase());
  if (clients.some((client) => /^(openai|chatgpt|openai-compatible)$/.test(client))) return true;
  if (["openai", "chatgpt"].includes((resource.category_slug ?? "").toLowerCase())) return true;

  const searchable =
    `${resource.slug} ${resource.name} ${resource.description ?? ""}`.toLowerCase();
  return /(^|[^a-z0-9])(openai|chatgpt)([^a-z0-9]|$)/.test(searchable);
}
