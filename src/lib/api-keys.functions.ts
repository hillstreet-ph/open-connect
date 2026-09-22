import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isAccessProfile, scopesForProfile, type AccessProfile } from "@/lib/access-profiles";

/**
 * Full autonomous surface for oc_live_ keys.
 * New keys auto-grant all product scopes so ChatGPT / Claude / Grok / Open WebUI
 * / Pipedream / Composio agents work without manual scope picking.
 */
export const DEFAULT_KEY_SCOPES = scopesForProfile("developer");

export const listApiKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("api_keys")
      .select(
        "id, name, key_prefix, scopes, access_profile, organization_id, workspace_id, project_id, last_used_at, revoked_at, created_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      name?: string;
      profile?: AccessProfile;
      scopes?: string[];
      organizationId?: string;
      workspaceId?: string;
      projectId?: string;
    }) => {
      const profile = isAccessProfile(input?.profile ?? "") ? input.profile! : "developer";
      return {
        name: (input?.name ?? "").trim() || "Default key",
        profile,
        scopes: scopesForProfile(profile, input?.scopes),
        organizationId: input?.organizationId || null,
        workspaceId: input?.workspaceId || null,
        projectId: input?.projectId || null,
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { generateKey } = await import("./gateway.server");
    const key = generateKey();
    const { error } = await context.supabase.from("api_keys").insert({
      user_id: context.userId,
      name: data.name,
      key_prefix: key.prefix,
      key_hash: key.hash,
      scopes: data.scopes,
      access_profile: data.profile,
      organization_id: data.organizationId,
      workspace_id: data.workspaceId,
      project_id: data.projectId,
    });
    if (error) throw new Error(error.message);
    return { key: key.raw, scopes: data.scopes, profile: data.profile };
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => ({ id: input.id }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
