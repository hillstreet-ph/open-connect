import { resourceCategories } from "./nav.ts";

export const RESOURCE_CATEGORIES = [
  { type: "agent", label: "Agents" },
  { type: "skill", label: "Skills" },
  { type: "plugin", label: "Plugins" },
  { type: "mcp", label: "MCP Servers" },
  { type: "tool", label: "Tools" },
  { type: "app", label: "Apps" },
  { type: "model", label: "Models" },
  { type: "prompt", label: "Prompts" },
  { type: "toolkit", label: "Toolkits" },
  { type: "memory", label: "Memory" },
  { type: "knowledge", label: "Knowledge" },
] as const;

export type ProjectResourceRow = {
  shared?: boolean;
  id: string;
  resources?: {
    id?: string;
    name?: string;
    resource_type?: string;
    category_slug?: string | null;
    version?: string | null;
    description?: string | null;
  } | null;
};

export function groupProjectResources<T extends ProjectResourceRow>(rows: T[]) {
  const groups = RESOURCE_CATEGORIES.map((category) => ({
    ...category,
    items: rows.filter((row) => row.resources?.resource_type === category.type),
  }));
  const known = new Set(RESOURCE_CATEGORIES.map((category) => category.type as string));
  const other = rows.filter((row) => !known.has(row.resources?.resource_type ?? ""));
  if (other.length) groups.push({ type: "other" as never, label: "Others" as never, items: other });
  return groups.filter((group) => group.items.length > 0);
}

/** Use the catalog's purpose categories; resource types already have sidebar pages. */
export function resourcePurpose(row: ProjectResourceRow) {
  const category = row.resources?.category_slug?.trim();
  return category === "development" ? "developer" : category || "general";
}

export function groupResourcesByPurpose<T extends ProjectResourceRow>(rows: T[]) {
  const groups = new Map<string, { type: string; label: string; items: T[] }>();
  for (const row of rows) {
    if (!row.resources) continue;
    const type = resourcePurpose(row);
    const label = type.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
    const group = groups.get(type) ?? { type, label, items: [] };
    group.items.push(row);
    groups.set(type, group);
  }
  return [...groups.values()].sort((a, b) =>
    a.type === "general" ? 1 : b.type === "general" ? -1 : a.label.localeCompare(b.label),
  );
}

/** Maps every library item into the same ordered type buckets used by Marketplace. */
export function resourceCategoryForType(type: string | null | undefined) {
  const category = resourceCategories.find((item) => item.value === type);
  return category && category.value !== "all" ? category.value : "other";
}

export function groupResourcesByType<T extends ProjectResourceRow>(rows: T[]) {
  return resourceCategories
    .filter((category) => category.value !== "all")
    .map((category) => ({
      type: category.value,
      label: category.label,
      items: rows.filter(
        (row) => resourceCategoryForType(row.resources?.resource_type) === category.value,
      ),
    }))
    .filter((group) => group.items.length > 0);
}
