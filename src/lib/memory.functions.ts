import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MemoryType = "fact" | "preference" | "decision" | "instruction" | "summary";
export type KnowledgeSourceType =
  "note" | "document" | "url" | "repository" | "conversation" | "api";

function cleanTags(value?: string) {
  return [
    ...new Set(
      (value ?? "")
        .split(",")
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean),
    ),
  ].slice(0, 20);
}

export const listMemories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input?: { projectId?: string; memoryType?: string }) => ({
    projectId: input?.projectId || null,
    memoryType: input?.memoryType || null,
  }))
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("memory_records")
      .select(
        "id, project_id, agent_id, session_id, title, content, memory_type, importance, pinned, tags, expires_at, created_at, updated_at",
      )
      .order("pinned", { ascending: false })
      .order("importance", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(200);
    if (data.projectId) query = query.eq("project_id", data.projectId);
    if (data.memoryType) query = query.eq("memory_type", data.memoryType);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      title: string;
      content: string;
      memoryType: MemoryType;
      importance?: number;
      projectId?: string;
      tags?: string;
    }) => ({
      title: (input?.title ?? "").trim(),
      content: (input?.content ?? "").trim(),
      memoryType: input?.memoryType ?? "fact",
      importance: Math.min(5, Math.max(1, Number(input?.importance) || 3)),
      projectId: input?.projectId || null,
      tags: cleanTags(input?.tags),
    }),
  )
  .handler(async ({ data, context }) => {
    if (!data.title || !data.content) throw new Error("Title and memory content are required");
    const { data: row, error } = await context.supabase
      .from("memory_records")
      .insert({
        user_id: context.userId,
        project_id: data.projectId,
        title: data.title,
        content: data.content,
        memory_type: data.memoryType,
        importance: data.importance,
        tags: data.tags,
      })
      .select("id, title")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const setMemoryPinned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string; pinned: boolean }) => ({
    id: input?.id ?? "",
    pinned: Boolean(input?.pinned),
  }))
  .handler(async ({ data, context }) => {
    if (!data.id) throw new Error("Memory id required");
    const { error } = await context.supabase
      .from("memory_records")
      .update({ pinned: data.pinned })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => ({ id: input?.id ?? "" }))
  .handler(async ({ data, context }) => {
    if (!data.id) throw new Error("Memory id required");
    const { error } = await context.supabase.from("memory_records").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listKnowledge = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input?: { projectId?: string; query?: string }) => ({
    projectId: input?.projectId || null,
    query: (input?.query ?? "").trim().slice(0, 200),
  }))
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("knowledge_items")
      .select(
        "id, project_id, title, content, source_type, source_url, mime_type, status, tags, created_at, updated_at",
      )
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (data.projectId) query = query.eq("project_id", data.projectId);
    if (data.query)
      query = query.textSearch("search_vector", data.query, {
        type: "websearch",
        config: "english",
      });
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      title: string;
      content: string;
      sourceType: KnowledgeSourceType;
      sourceUrl?: string;
      projectId?: string;
      tags?: string;
    }) => ({
      title: (input?.title ?? "").trim(),
      content: (input?.content ?? "").trim(),
      sourceType: input?.sourceType ?? "note",
      sourceUrl: (input?.sourceUrl ?? "").trim() || null,
      projectId: input?.projectId || null,
      tags: cleanTags(input?.tags),
    }),
  )
  .handler(async ({ data, context }) => {
    if (!data.title || !data.content) throw new Error("Title and knowledge content are required");
    const { data: row, error } = await context.supabase
      .from("knowledge_items")
      .insert({
        user_id: context.userId,
        project_id: data.projectId,
        title: data.title,
        content: data.content,
        source_type: data.sourceType,
        source_url: data.sourceUrl,
        tags: data.tags,
        status: "ready",
      })
      .select("id, title")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const archiveKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => ({ id: input?.id ?? "" }))
  .handler(async ({ data, context }) => {
    if (!data.id) throw new Error("Knowledge id required");
    const { error } = await context.supabase
      .from("knowledge_items")
      .update({ status: "archived" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
