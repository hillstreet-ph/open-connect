import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MemoryType = "fact" | "preference" | "decision" | "instruction" | "summary";
export type KnowledgeSourceType =
  "note" | "document" | "url" | "repository" | "conversation" | "api";

type UploadedFile = {
  name: string;
  path: string;
  mimeType: string;
  size: number;
};

function duplicateKey(title: string, content: string, projectId: string | null) {
  const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
  return `${projectId ?? "personal"}\u0000${normalize(title)}\u0000${normalize(content)}`;
}

function duplicateIds(
  rows: Array<{ id: string; title: string; content: string; project_id: string | null }>,
) {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const row of rows) {
    const key = duplicateKey(row.title, row.content, row.project_id);
    if (seen.has(key)) duplicates.push(row.id);
    else seen.add(key);
  }
  return duplicates;
}

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

function canonicalizeSourceUrl(value?: string) {
  const input = (value ?? "").trim();
  if (!input) return null;
  try {
    const url = new URL(input);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if (
      (url.protocol === "https:" && url.port === "443") ||
      (url.protocol === "http:" && url.port === "80")
    ) {
      url.port = "";
    }
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    throw new Error("Source URL must be a valid http or https URL");
  }
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
    query = data.projectId ? query.eq("project_id", data.projectId) : query.is("project_id", null);
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
      file?: UploadedFile;
    }) => ({
      title: (input?.title ?? "").trim(),
      content: (input?.content ?? "").trim(),
      memoryType: input?.memoryType ?? "fact",
      importance: Math.min(5, Math.max(1, Number(input?.importance) || 3)),
      projectId: input?.projectId || null,
      tags: cleanTags(input?.tags),
      file: input?.file ?? null,
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
        metadata: data.file ? { file: data.file } : {},
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

export const removeDuplicateMemories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input?: { projectId?: string }) => ({ projectId: input?.projectId || null }))
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("memory_records")
      .select("id, project_id, title, content")
      .order("updated_at", { ascending: false })
      .limit(1000);
    query = data.projectId ? query.eq("project_id", data.projectId) : query.is("project_id", null);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    const ids = duplicateIds(rows ?? []);
    if (!ids.length) return { removed: 0 };
    const { error: deleteError } = await context.supabase
      .from("memory_records")
      .delete()
      .in("id", ids);
    if (deleteError) throw new Error(deleteError.message);
    return { removed: ids.length };
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
      file?: UploadedFile;
    }) => ({
      title: (input?.title ?? "").trim(),
      content: (input?.content ?? "").trim(),
      sourceType: input?.sourceType ?? "note",
      sourceUrl: canonicalizeSourceUrl(input?.sourceUrl),
      projectId: input?.projectId || null,
      tags: cleanTags(input?.tags),
      file: input?.file ?? null,
    }),
  )
  .handler(async ({ data, context }) => {
    if (!data.title || !data.content) throw new Error("Title and knowledge content are required");
    if (data.sourceUrl && !/^https?:\/\//i.test(data.sourceUrl)) {
      throw new Error("Source URL must use http or https");
    }

    if (data.sourceUrl) {
      let existingQuery = context.supabase
        .from("knowledge_items")
        .select("id, title")
        .eq("user_id", context.userId)
        .eq("source_url", data.sourceUrl)
        .neq("status", "archived");
      existingQuery = data.projectId
        ? existingQuery.eq("project_id", data.projectId)
        : existingQuery.is("project_id", null);
      const { data: existing, error: existingError } = await existingQuery.maybeSingle();
      if (existingError) throw new Error(existingError.message);
      if (existing) return { ...existing, duplicate: true };
    }
    const { data: row, error } = await context.supabase
      .from("knowledge_items")
      .insert({
        user_id: context.userId,
        project_id: data.projectId,
        title: data.title,
        content: data.content,
        source_type: data.sourceType,
        source_url: data.sourceUrl,
        mime_type: data.file?.mimeType ?? null,
        tags: data.tags,
        status: "ready",
        metadata: data.file ? { file: data.file } : {},
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

export const removeDuplicateKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input?: { projectId?: string }) => ({ projectId: input?.projectId || null }))
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("knowledge_items")
      .select("id, project_id, title, content")
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(1000);
    if (data.projectId) query = query.eq("project_id", data.projectId);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    const ids = duplicateIds(rows ?? []);
    if (!ids.length) return { removed: 0 };
    const { error: archiveError } = await context.supabase
      .from("knowledge_items")
      .update({ status: "archived" })
      .in("id", ids);
    if (archiveError) throw new Error(archiveError.message);
    return { removed: ids.length };
  });

export const listContextProjectAssignments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { kind: "memory" | "knowledge"; id: string }) => ({
    kind: input.kind,
    id: input.id,
  }))
  .handler(async ({ data, context }) => {
    const table = data.kind === "memory" ? "memory_records" : "knowledge_items";
    const { data: rows, error } = await context.supabase
      .from(table)
      .select("project_id, metadata")
      .not("project_id", "is", null);
    if (error) throw new Error(error.message);
    const matched = (rows ?? []).filter(
      (row) =>
        (row.metadata as { library_source_id?: string } | null)?.library_source_id === data.id,
    );
    const projectIds = matched.flatMap((row) => (row.project_id ? [row.project_id] : []));
    if (!projectIds.length) return [];
    const { data: projects, error: projectError } = await context.supabase
      .from("projects")
      .select("id, name")
      .in("id", projectIds);
    if (projectError) throw new Error(projectError.message);
    const names = new Map((projects ?? []).map((project) => [project.id, project.name]));
    return matched.map((row) => ({
      projectId: row.project_id as string,
      name: names.get(row.project_id as string) ?? "Project",
    }));
  });

export const addContextToProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { kind: "memory" | "knowledge"; id: string; projectId: string }) => ({
    kind: input.kind,
    id: input.id,
    projectId: input.projectId,
  }))
  .handler(async ({ data, context }) => {
    if (!data.id || !data.projectId) throw new Error("Item and project are required");
    if (data.kind === "memory") {
      const source = await context.supabase
        .from("memory_records")
        .select("title, content, memory_type, importance, pinned, tags, expires_at, metadata")
        .eq("id", data.id)
        .single();
      if (source.error) throw new Error(source.error.message);
      const existing = await context.supabase
        .from("memory_records")
        .select("id")
        .eq("project_id", data.projectId)
        .contains("metadata", { library_source_id: data.id })
        .maybeSingle();
      if (existing.error) throw new Error(existing.error.message);
      if (existing.data) return { duplicate: true };
      const { error } = await context.supabase.from("memory_records").insert({
        ...source.data,
        user_id: context.userId,
        project_id: data.projectId,
        metadata: { ...(source.data.metadata as object), library_source_id: data.id },
      });
      if (error) throw new Error(error.message);
    } else {
      const source = await context.supabase
        .from("knowledge_items")
        .select("title, content, source_type, source_url, mime_type, tags, metadata")
        .eq("id", data.id)
        .single();
      if (source.error) throw new Error(source.error.message);
      const existing = await context.supabase
        .from("knowledge_items")
        .select("id")
        .eq("project_id", data.projectId)
        .contains("metadata", { library_source_id: data.id })
        .neq("status", "archived")
        .maybeSingle();
      if (existing.error) throw new Error(existing.error.message);
      if (existing.data) return { duplicate: true };
      const { error } = await context.supabase.from("knowledge_items").insert({
        ...source.data,
        user_id: context.userId,
        project_id: data.projectId,
        status: "ready",
        metadata: { ...(source.data.metadata as object), library_source_id: data.id },
      });
      if (error) throw new Error(error.message);
    }
    return { duplicate: false };
  });
