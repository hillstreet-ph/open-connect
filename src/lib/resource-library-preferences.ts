const DEFAULT_COLLECTION_KEY = "open-connect:default-marketplace-collection";

function preferenceKey(userId: string) {
  return `${DEFAULT_COLLECTION_KEY}:${userId}`;
}

export function getDefaultMarketplaceCollection(userId: string) {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(preferenceKey(userId)) ?? "";
}

export function setDefaultMarketplaceCollection(userId: string, collectionId: string) {
  if (typeof window === "undefined") return;
  if (collectionId) window.localStorage.setItem(preferenceKey(userId), collectionId);
  else window.localStorage.removeItem(preferenceKey(userId));
}
