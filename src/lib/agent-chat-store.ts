import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import type { chatSaveSchema } from "./agent-chat.ts";
/** A reply never overwrites another window's chat revision. Owner comes only from verified auth. */
export async function saveChatRow(
  db: SupabaseClient,
  userId: string,
  data: z.infer<typeof chatSaveSchema>,
) {
  const record = {
    title: data.title,
    mode: data.mode,
    messages: data.messages,
    browser_run_id: data.browser_run_id,
    updated_at: new Date().toISOString(),
    revision: (data.revision ?? -1) + 1,
  };
  const query = db.from("agent_chats");
  const result =
    data.revision === null
      ? await query
          .insert({ ...record, id: data.id, user_id: userId })
          .select("id,revision")
          .single()
      : await query
          .update(record)
          .eq("id", data.id)
          .eq("user_id", userId)
          .eq("revision", data.revision)
          .select("id,revision")
          .maybeSingle();
  if (result.error || !result.data)
    throw new Error(
      "Chat was not saved or changed in another window. Reload history before continuing; your unsaved text remains here.",
    );
  return result.data as { id: string; revision: number };
}
