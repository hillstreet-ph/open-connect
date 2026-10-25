import { captureHelperExchange, readRepeatedContext } from "./data-controls.server";
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  defaultDataControls,
  redactDataExport,
  redactDataText,
  validateDataControls,
  type DataControls,
} from "./data-controls";

export type ReuseDraft = {
  id: string;
  title: string;
  content: string;
  resource_type: string;
  resource_id: string | null;
  created_at: string;
};
export type DataActivity = {
  id: string;
  source_kind: string;
  source_key: string;
  source_id: string;
  created_at: string;
};

async function controls(db: SupabaseClient, userId: string): Promise<DataControls> {
  const { data, error } = await db
    .from("data_control_settings")
    .select("capture_activity,save_helper_memory,suggest_drafts,retention_days")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? defaultDataControls;
}
export const getDataControls = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase as SupabaseClient;
    const settings = await controls(db, context.userId);
    const since = new Date(Date.now() - settings.retention_days * 86400000).toISOString();
    const [activity, drafts, repeated] = await Promise.all([
      db
        .from("data_control_activity")
        .select("id,source_kind,source_key,source_id,created_at")
        .eq("user_id", context.userId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(200),
      db
        .from("data_reuse_drafts")
        .select("id,title,content,resource_type,resource_id,created_at")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(100),
      readRepeatedContext(db, context.userId, since),
    ]);
    if (activity.error || drafts.error)
      throw new Error(activity.error?.message ?? drafts.error?.message);
    return {
      settings,
      repeated,
      activity: (activity.data ?? []) as DataActivity[],
      drafts: (drafts.data ?? []) as ReuseDraft[],
    };
  });
export const saveDataControls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validateDataControls)
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as SupabaseClient)
      .from("data_control_settings")
      .upsert({ ...data, user_id: context.userId, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    if (data.capture_activity) {
      const { error: syncError } = await (context.supabase as SupabaseClient).rpc(
        "sync_data_control_activity",
      );
      if (syncError) throw new Error(syncError.message);
    }
    return { ok: true };
  });

/** Cursor pagination exports every owned row rather than silently truncating at 1,000. */
async function exportRows(
  db: SupabaseClient,
  table: string,
  columns: string,
  ownerColumn: string,
  userId: string,
) {
  const rows: Record<string, unknown>[] = [];
  let cursor: string | null = null;
  while (true) {
    let query = db.from(table).select(columns).eq(ownerColumn, userId).order("id").limit(500);
    if (cursor) query = query.gt("id", cursor);
    const { data, error } = await query;
    if (error) throw new Error(`Export failed for ${table}: ${error.message}`);
    const page = (data ?? []) as unknown as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < 500) break;
    cursor = String(page[page.length - 1]!["id"]);
  }
  return rows;
}
export const exportDataControls = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase as SupabaseClient;
    const settings = await controls(db, context.userId);
    const tables = [
      [
        "memory_records",
        "id,project_id,title,content,memory_type,importance,pinned,tags,expires_at,created_at,updated_at",
        "user_id",
      ],
      [
        "knowledge_items",
        "id,project_id,title,content,source_type,source_url,status,tags,created_at,updated_at",
        "user_id",
      ],
      ["agent_chats", "id,title,mode,messages,browser_run_id,created_at,updated_at", "user_id"],
      ["data_control_activity", "id,source_kind,source_key,source_id,created_at", "user_id"],
      [
        "data_reuse_drafts",
        "id,source_key,title,content,resource_type,resource_id,created_at,updated_at",
        "user_id",
      ],
      ["toolkits", "id,slug,name,description,published,created_at,updated_at", "user_id"],
      [
        "resources",
        "id,slug,name,description,resource_type,source,source_url,license,verified,published,created_at,updated_at",
        "owner_id",
      ],
    ];
    const entries = await Promise.all(
      tables.map(
        async ([table, columns, owner]) =>
          [table!, await exportRows(db, table!, columns!, owner!, context.userId)] as const,
      ),
    );
    return JSON.stringify(
      redactDataExport({
        format: "open-connect-data-export",
        version: 1,
        exported_at: new Date().toISOString(),
        settings,
        ...Object.fromEntries(entries),
        attachments:
          "File metadata and text only; binary attachments and credentials are excluded.",
      }),
      null,
      2,
    );
  });
export const saveReuseDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id?: string; title: string; content: string; resource_type: string }) => {
    if (!["skill", "prompt", "guide", "toolkit"].includes(input.resource_type))
      throw new Error("Choose a supported draft type");
    if (
      !input.title.trim() ||
      !input.content.trim() ||
      input.title.length > 200 ||
      input.content.length > 50000
    )
      throw new Error("Provide a title and content within the size limits");
    return { ...input, title: input.title.trim(), content: redactDataText(input.content.trim()) };
  })
  .handler(async ({ data, context }) => {
    const db = context.supabase as SupabaseClient;
    if (data.id) {
      const { data: row, error } = await db
        .from("data_reuse_drafts")
        .update({
          title: data.title,
          content: data.content,
          resource_type: data.resource_type,
          updated_at: new Date().toISOString(),
        })
        .eq("id", data.id)
        .eq("user_id", context.userId)
        .is("resource_id", null)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      return row.id as string;
    }
    const { data: row, error } = await db
      .from("data_reuse_drafts")
      .insert({
        user_id: context.userId,
        source_key: `manual:${crypto.randomUUID()}`,
        title: data.title,
        content: data.content,
        resource_type: data.resource_type,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row.id as string;
  });
export const buildReuseDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: rid, error } = await (context.supabase as SupabaseClient).rpc(
      "build_data_reuse_draft",
      { draft_id: data.id },
    );
    if (error) throw new Error(error.message);
    return { resourceId: rid as string };
  });
export const clearDataActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await (context.supabase as SupabaseClient)
      .from("data_control_activity")
      .delete()
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveRepeatedKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { key: string }) => {
    if (!/^(prompt|response):[a-f0-9]{64}$/.test(input.key))
      throw new Error("Choose a detected pattern");
    return input;
  })
  .handler(async ({ data, context }) => {
    const db = context.supabase as SupabaseClient;
    const settings = await controls(db, context.userId);
    const groups = await readRepeatedContext(
      db,
      context.userId,
      new Date(Date.now() - settings.retention_days * 86400000).toISOString(),
    );
    const group = groups.find((item) => item.key === data.key);
    if (!group) throw new Error("This pattern is no longer available");
    const hash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${context.userId}:knowledge:${group.key}`),
    );
    const h = Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
    const id = `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
    const { error } = await db.from("knowledge_items").upsert(
      {
        id,
        user_id: context.userId,
        title: "Repeated context note (unverified)",
        content: `Unverified note saved after user review. Repetition is not evidence of correctness.\n\n${group.summary}`,
        source_type: "note",
        status: "ready",
        tags: ["repeated-context", "unverified"],
        metadata: {
          verification_status: "unverified",
          context_key: group.key,
          memory_ids: group.memory_ids,
        },
      },
      { onConflict: "id", ignoreDuplicates: true },
    );
    if (error) throw new Error("Knowledge note could not be saved");
    return { id };
  });

export async function captureHelperMemory(
  db: SupabaseClient,
  userId: string,
  prompt: string,
  reply: string,
) {
  const settings = await controls(db, userId);
  await captureHelperExchange(db, userId, prompt, reply, settings);
}
