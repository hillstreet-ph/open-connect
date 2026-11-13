import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validateIntegrationInput, type OAuthIntegration } from "./oauth-integrations";

const CLIENT_ID_RE = /^oc_cli_[0-9a-f]{32,48}$/;

function clientId(value: unknown): string {
  if (typeof value !== "string" || !CLIENT_ID_RE.test(value)) throw new Error("Invalid client ID.");
  return value;
}

function friendly(error: { message?: string } | null, fallback: string): never {
  const message = error?.message ?? "";
  // Database validation messages are written for end users; anything else is generic.
  if (/^(Name must|Provide 1 to|Integration (limit|not found)|Sign in required)/.test(message))
    throw new Error(message);
  throw new Error(fallback);
}

export const listOAuthIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("oc_list_oauth_integrations");
    if (error) friendly(error, "Could not load OAuth integrations.");
    return (data ?? []) as OAuthIntegration[];
  });

export const createOAuthIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { name: string; redirect_uris: string[] }) => validateIntegrationInput(input))
  .handler(async ({ data, context }) => {
    const { data: created, error } = await context.supabase.rpc("oc_create_oauth_integration", {
      p_name: data.name,
      p_redirect_uris: data.redirect_uris,
    });
    if (error) friendly(error, "Could not register the integration.");
    return created as { client_id: string; client_secret: string; client_name: string };
  });

export const updateOAuthIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { client_id: string; name: string; redirect_uris: string[] }) => ({
    client_id: clientId(input.client_id),
    ...validateIntegrationInput(input),
  }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("oc_update_oauth_integration", {
      p_client_id: data.client_id,
      p_name: data.name,
      p_redirect_uris: data.redirect_uris,
    });
    if (error) friendly(error, "Could not update the integration.");
    return { ok: true };
  });

export const rotateOAuthIntegrationSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { client_id: string }) => ({ client_id: clientId(input.client_id) }))
  .handler(async ({ data, context }) => {
    const { data: rotated, error } = await context.supabase.rpc(
      "oc_rotate_oauth_integration_secret",
      { p_client_id: data.client_id },
    );
    if (error) friendly(error, "Could not rotate the client secret.");
    return rotated as { client_id: string; client_secret: string };
  });

export const revokeOAuthIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { client_id: string }) => ({ client_id: clientId(input.client_id) }))
  .handler(async ({ data, context }) => {
    const { data: revoked, error } = await context.supabase.rpc("oc_revoke_oauth_integration", {
      p_client_id: data.client_id,
    });
    if (error) friendly(error, "Could not revoke the integration.");
    if (!revoked) throw new Error("Integration not found or already revoked.");
    return { ok: true };
  });
