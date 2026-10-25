import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { saveChatRow } from "./agent-chat-store";
import { chatSaveSchema, chatMessageSchema } from "./agent-chat";

export const listAgentChats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      before: z
        .object({ at: z.string().datetime({ offset: true }), id: z.string().uuid() })
        .optional(),
      query: z.string().max(120).default(""),
    }),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as SupabaseClient;
    let query = db
      .from("agent_chats")
      .select("id,title,mode,browser_run_id,updated_at,revision")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false })
      .order("id")
      .limit(51);
    if (data.before)
      query = query.or(
        `updated_at.lt.${data.before.at},and(updated_at.eq.${data.before.at},id.gt.${data.before.id})`,
      );
    if (data.query.trim())
      query = query.ilike("title", `%${data.query.replace(/[%_\\]/g, "").trim()}%`);
    const { data: rows, error } = await query;
    if (error)
      throw new Error("Chat history could not be loaded. Your current chat is still open.");
    return {
      chats: (rows ?? []).slice(0, 50),
      next:
        (rows?.length ?? 0) > 50
          ? { at: String(rows![49]!.updated_at), id: String(rows![49]!.id) }
          : null,
    };
  });
export const getAgentChat = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await (context.supabase as SupabaseClient)
      .from("agent_chats")
      .select("id,title,mode,messages,browser_run_id,updated_at,revision")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .single();
    if (error || !row) throw new Error("Chat not found for this account.");
    return { ...row, messages: z.array(chatMessageSchema).max(200).parse(row.messages) };
  });
export const saveAgentChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(chatSaveSchema)
  .handler(async ({ data, context }) => {
    return saveChatRow(context.supabase as SupabaseClient, context.userId, data);
  });
export const deleteAgentChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as SupabaseClient)
      .from("agent_chats")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error("Chat could not be deleted.");
    return { deleted: true };
  });

export const renameAgentChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    z.object({
      id: z.string().uuid(),
      title: z.string().trim().min(1).max(120),
      revision: z.number().int().min(0),
    }),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await (context.supabase as SupabaseClient)
      .from("agent_chats")
      .update({
        title: data.title,
        revision: data.revision + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .eq("revision", data.revision)
      .select("revision")
      .maybeSingle();
    if (error || !row)
      throw new Error("Chat changed in another window. Refresh history before renaming.");
    return { revision: Number(row.revision) };
  });
