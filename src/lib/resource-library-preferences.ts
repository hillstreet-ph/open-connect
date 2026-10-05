const DEFAULT_COLLECTION_KEY = "open-connect:default-marketplace-collection";

function preferenceKey(userId: string) {
  return `${DEFAULT_COLLECTION_KEY}:${userId}`;
}

export function getDefaultMarketplaceCollection(userId: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(preferenceKey(userId));
}

export function setDefaultMarketplaceCollection(userId: string, collectionId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(preferenceKey(userId), collectionId);
}

export function resolveDefaultMarketplaceCollection(
  userId: string | undefined,
  collections: Array<{ id: string; name: string }> | undefined,
  override?: string | null,
) {
  const saved = override ?? (userId ? getDefaultMarketplaceCollection(userId) : null);
  if (
    saved !== null &&
    (!saved || !collections || collections.some((collection) => collection.id === saved))
  ) {
    return saved;
  }
  if (!collections) return saved ?? "";
  return (
    collections.find((collection) => collection.name.trim().toLowerCase() === "kobeplay")?.id ?? ""
  );
}
