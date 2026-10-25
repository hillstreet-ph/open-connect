import type { SupabaseClient } from "@supabase/supabase-js";
type ContextExportRow = {
  id: string;
  project_id: string | null;
  title: string;
  content: string;
  tags: string[];
  created_at: string;
  updated_at: string;
};

/** Explicit account export: owned context only, no connector or credential tables. */
export async function exportOwnedContext(db: SupabaseClient, userId: string) {
  async function read(table: "memory_records" | "knowledge_items") {
    const rows: ContextExportRow[] = [];
    for (let offset = 0; offset <= 20000; offset += 500) {
      const { data, error } = await db
        .from(table)
        .select("id,project_id,title,content,tags,created_at,updated_at")
        .eq("user_id", userId)
        .order("id")
        .range(offset, offset + 499);
      if (error) throw new Error("Context export failed. No partial export was created.");
      if (offset === 20000 && data?.length)
        throw new Error(
          "Context export exceeds 20000 records per section. Export smaller subsets from Memory or Knowledge.",
        );
      rows.push(...(data ?? []));
      if ((data?.length ?? 0) < 500) return rows;
    }
    return rows;
  }
  const [memory, knowledge] = await Promise.all([read("memory_records"), read("knowledge_items")]);
  return {
    format: "open-connect-context-v1",
    exported_at: new Date().toISOString(),
    memory,
    knowledge,
  };
}
