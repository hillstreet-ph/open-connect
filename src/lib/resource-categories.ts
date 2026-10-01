export const RESOURCE_CATEGORIES = [
  { type: "agent", label: "Agents" },
  { type: "skill", label: "Skills" },
  { type: "plugin", label: "Plugins" },
  { type: "mcp", label: "MCP Servers" },
  { type: "tool", label: "Tools" },
  { type: "guide", label: "Guides" },
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
  if (other.length) groups.push({ type: "other" as never, label: "Other" as never, items: other });
  return groups.filter((group) => group.items.length > 0);
}
