export type FactorySearch = {
  agent?: string;
  chat?: string;
  project?: string;
  view?: "teams" | "roster";
};

/** Share validated selections between canonical navigation and old bookmarks. */
export function factorySearch(input: Record<string, unknown>): FactorySearch {
  const result: FactorySearch = {};
  for (const key of ["agent", "chat", "project"] as const) {
    const value = input[key];
    if (typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value)) result[key] = value;
  }
  if (input["view"] === "teams" || input["view"] === "roster") result.view = input["view"];
  return result;
}
