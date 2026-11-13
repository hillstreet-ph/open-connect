import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { templateInput, type WorkTemplate } from "@/lib/operations";

export const listWorkTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Generated types are updated separately from deployed schema migrations.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = context.supabase as any;
    const { data, error } = await db
      .from("work_templates")
      .select("id,name,kind,title,description,priority")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error("Could not load saved templates.");
    return (data ?? []) as WorkTemplate[];
  });
export const saveWorkTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => templateInput.parse(input))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = context.supabase as any;
    const { data: row, error } = await db
      .from("work_templates")
      .insert({ ...data, user_id: context.userId })
      .select("id")
      .single();
    if (error?.code === "23505")
      throw new Error("A template with this name already exists. Choose another name.");
    if (error) throw new Error("Could not save template.");
    return row as { id: string };
  });
export const deleteWorkTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = context.supabase as any;
    const { error } = await db
      .from("work_templates")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error("Could not remove template.");
    return { ok: true };
  });
