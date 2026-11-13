export const MAX_BULK_LIBRARY = 1000;
export const COLLECTION_LIMIT = 100;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validates and de-duplicates a bulk "add to library" request. Throws on bad input. */
export function normalizeLibraryBulkInput(input: unknown): {
  resourceIds: string[];
  collectionId: string | null;
} {
  const raw = (input ?? {}) as { resourceIds?: unknown; collectionId?: unknown };
  if (!Array.isArray(raw.resourceIds)) throw new Error("Select at least one resource");
  const resourceIds = [
    ...new Set(
      raw.resourceIds.map((id) => (typeof id === "string" ? id.trim().toLowerCase() : "")),
    ),
  ];
  if (!resourceIds.length) throw new Error("Select at least one resource");
  if (resourceIds.length > MAX_BULK_LIBRARY) {
    throw new Error(`Select at most ${MAX_BULK_LIBRARY} resources at a time`);
  }
  if (resourceIds.some((id) => !UUID_PATTERN.test(id))) throw new Error("Invalid resource id");
  const collection = typeof raw.collectionId === "string" ? raw.collectionId.trim() : "";
  if (collection && !UUID_PATTERN.test(collection)) throw new Error("Invalid collection id");
  return { resourceIds, collectionId: collection || null };
}

/**
 * Decides which non-skill resources fit into a collection that holds at most
 * COLLECTION_LIMIT items. Resources already in it always fit.
 */
export function planCollectionAdd(
  resourceIds: string[],
  existingIds: Iterable<string>,
  limit = COLLECTION_LIMIT,
): { add: string[]; overflow: string[] } {
  const existing = new Set(existingIds);
  let room = Math.max(0, limit - existing.size);
  const add: string[] = [];
  const overflow: string[] = [];
  for (const id of resourceIds) {
    if (existing.has(id)) continue;
    if (room > 0) {
      add.push(id);
      room -= 1;
    } else {
      overflow.push(id);
    }
  }
  return { add, overflow };
}
