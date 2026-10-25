import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeRepeatedText,
  redactDataText,
  repeatedContext,
  repeatedPromptDraft,
  type DataControls,
} from "./data-controls.ts";

async function digest(text: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function readRepeatedContext(db: SupabaseClient, userId: string, since: string) {
  const { data, error } = await db
    .from("memory_records")
    .select("id,metadata")
    .eq("user_id", userId)
    .contains("metadata", { auto_capture: true })
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error("Repeated context could not be read");
  return repeatedContext(data ?? []);
}

export async function captureHelperExchange(
  db: SupabaseClient,
  userId: string,
  prompt: string,
  reply: string,
  settings: DataControls,
  source: "agent-helper" | "host-shared" = "agent-helper",
) {
  if (!settings.save_helper_memory) return;
  const redacted = redactDataText(
    `User request: ${prompt}\n\nAssistant response (unverified): ${reply}`,
  );
  const content = redacted.slice(0, 8000);
  const fingerprint = await digest(redacted);
  const identity = await digest(`${userId}:${fingerprint}`);
  const id = `${identity.slice(0, 8)}-${identity.slice(8, 12)}-4${identity.slice(13, 16)}-a${identity.slice(17, 20)}-${identity.slice(20, 32)}`;
  const [promptHash, responseHash] = await Promise.all([
    digest(normalizeRepeatedText(prompt)),
    digest(normalizeRepeatedText(reply)),
  ]);
  const { error } = await db.from("memory_records").upsert(
    {
      id,
      user_id: userId,
      title: source === "agent-helper" ? "Agent-Helper interaction" : "Shared host interaction",
      content,
      memory_type: "summary",
      importance: 2,
      tags: ["auto-saved", source],
      metadata: {
        auto_capture: true,
        capture_source: source,
        auto_capture_hash: fingerprint,
        prompt_hash: promptHash,
        response_hash: responseHash,
        prompt_summary: redactDataText(prompt).slice(0, 500),
        response_summary: redactDataText(reply).slice(0, 500),
      },
      expires_at: new Date(Date.now() + settings.retention_days * 86400000).toISOString(),
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (error) throw new Error("Helper memory could not be saved");
  if (!settings.suggest_drafts) return { memory_id: id };
  const groups = await readRepeatedContext(
    db,
    userId,
    new Date(Date.now() - settings.retention_days * 86400000).toISOString(),
  );
  for (const group of groups.filter((g) => g.key === `prompt:${promptHash}` && g.count >= 3)) {
    const { error: draftError } = await db.from("data_reuse_drafts").upsert(
      {
        user_id: userId,
        source_key: `context:${group.key}`,
        ...repeatedPromptDraft(group),
      },
      { onConflict: "user_id,source_key", ignoreDuplicates: true },
    );
    if (draftError) throw new Error("Repeated prompt draft could not be saved");
  }
  return { memory_id: id };
}
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
