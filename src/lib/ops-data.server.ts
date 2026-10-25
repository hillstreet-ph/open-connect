import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../integrations/supabase/types";

/** tasks.project_id has no FK: an embedded projects(...) select fails in PostgREST. */
export async function loadOwnedTasks(
  db: SupabaseClient<Database>,
  userId: string,
  filters: { projectId?: string | null; status?: string | null } = {},
) {
  let query = db
    .from("tasks")
    .select(
      "id,title,description,status,priority,due_at,project_id,organization_id,created_at,updated_at",
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (filters.projectId) query = query.eq("project_id", filters.projectId);
  if (filters.status) query = query.eq("status", filters.status);
  const { data, error } = await query;
  if (error) throw new Error("Could not load your tasks. Please retry.");
  return data ?? [];
}
