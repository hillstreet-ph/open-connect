type Resource = {
  id?: string;
  name?: string;
  description?: string | null;
  version?: string | null;
  resource_type?: string;
};
type LibraryRow = { id: string; resources?: Resource | null };

/** Installed packages are reusable; private Studio context keeps explicit project assignments. */
export function isSharedLibraryRow(row: LibraryRow) {
  return (
    Boolean(row.resources) &&
    (!row.id.startsWith("owned-") ||
      !["memory", "knowledge"].includes(row.resources?.resource_type ?? ""))
  );
}

export function mergeSharedProjectResources<T extends LibraryRow, U extends LibraryRow>(
  assigned: T[],
  library: U[],
) {
  const resources = new Map<string, (T | U) & { shared: boolean }>();
  for (const row of assigned) {
    if (row.resources?.id) resources.set(row.resources.id, { ...row, shared: false });
  }
  for (const row of library.filter(isSharedLibraryRow)) {
    if (row.resources?.id) resources.set(row.resources.id, { ...row, shared: true });
  }
  return [...resources.values()];
}
