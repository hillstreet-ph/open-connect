import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CONTEXT_FILE_BUCKET, assertOwnFilePath } from "./context-storage";
export type ContextPreview = {
  id: string;
  title: string;
  preview: string;
  bytes: number;
  kind: string;
  updated_at: string;
};
export type StoredContextFile = {
  id: string;
  name: string;
  created_at: string;
  mime_type: string | null;
  bytes: number;
};
export type ContextStorageOverview = {
  memory: { count: number; bytes: number };
  knowledge: { count: number; bytes: number };
  storage: { count: number; bytes: number };
  memories: ContextPreview[];
  knowledge_items: ContextPreview[];
  files: StoredContextFile[];
};
export const getContextStorage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input?: { after?: string }) => ({ after: input?.after || null }))
  .handler(async ({ data, context }) => {
    const { data: overview, error } = await (context.supabase as SupabaseClient).rpc(
      "context_storage_overview",
      { p_after: data.after },
    );
    if (error) throw new Error("Could not load your storage overview");
    return overview as ContextStorageOverview;
  });
export const getContextRecord = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string; kind: "memory" | "knowledge" }) => {
    if (!["memory", "knowledge"].includes(input.kind)) throw new Error("Unknown context type");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from(data.kind === "memory" ? "memory_records" : "knowledge_items")
      .select("id,title,content,tags,metadata,created_at,updated_at")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .single();
    if (error || !row) throw new Error("Record not found");
    return row;
  });
export const getContextFileUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { path: string; download?: boolean }) => input)
  .handler(async ({ data, context }) => {
    const path = assertOwnFilePath(context.userId, data.path);
    const { data: signed, error } = await context.supabase.storage
      .from(CONTEXT_FILE_BUCKET)
      .createSignedUrl(path, 60, { download: data.download === true });
    if (error || !signed) throw new Error("File unavailable or access denied");
    return { url: signed.signedUrl };
  });
export const removeContextFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { path: string }) => input)
  .handler(async ({ data, context }) => {
    const path = assertOwnFilePath(context.userId, data.path);
    const { error } = await context.supabase.storage.from(CONTEXT_FILE_BUCKET).remove([path]);
    if (error) throw new Error("Could not delete your file");
    return { ok: true };
  });
