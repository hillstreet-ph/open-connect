import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listInboundIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("inbound_integrations")
      .select("id,provider,display_name,status,created_at,updated_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error("Could not load your integrations.");
    return data ?? [];
  });

export const configureTelegramIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { display_name: string; token: string }) => ({
    display_name: input.display_name,
    token: input.token,
  }))
  .handler(async ({ data, context }) => {
    const displayName = data.display_name.trim() || "Telegram bot";
    const token = data.token.trim();
    if (displayName.length > 80) throw new Error("Bot name must be 80 characters or fewer.");
    if (token.length < 20 || token.length > 256) throw new Error("Enter a valid Telegram bot token.");

    const response = await fetch("https://api.telegram.org/bot" + token + "/getMe", {
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error("Telegram could not verify this bot token.");
    const payload = (await response.json()) as {
      ok?: boolean;
      result?: { id?: number; username?: string };
    };
    if (!payload.ok || !payload.result?.id) {
      throw new Error("Telegram could not verify this bot token.");
    }

    const { data: existing, error: lookupError } = await context.supabase
      .from("inbound_integrations")
      .select("id,credential_reference")
      .eq("user_id", context.userId)
      .eq("provider", "telegram")
      .eq("display_name", displayName)
      .maybeSingle();
    if (lookupError) throw new Error("Could not check your existing Telegram integration.");

    const { data: secret, error: secretError } = await context.supabase.rpc(
      "create_credential_secret",
      {
        p_name: "Telegram · " + displayName,
        p_secret_type: "bot_token",
        p_scopes: ["inbound:telegram"],
        p_secret_value: JSON.stringify({
          version: 1,
          auth_type: "bot_token",
          credential: token,
        }),
      },
    );
    if (secretError) throw new Error("Could not save the Telegram credential securely.");
    const secretId = String((secret as { id?: string } | null)?.id ?? "");
    if (!secretId) throw new Error("Credential Vault did not return a reference.");

    const record = {
      user_id: context.userId,
      provider: "telegram",
      display_name: displayName,
      credential_reference: "credential://telegram/" + secretId,
      status: "connected",
      metadata: {
        bot_id: String(payload.result.id),
        username: payload.result.username ?? null,
      },
      updated_at: new Date().toISOString(),
    };
    const { data: integration, error: writeError } = existing
      ? await context.supabase
          .from("inbound_integrations")
          .update(record)
          .eq("id", existing.id)
          .eq("user_id", context.userId)
          .select("id,provider,display_name,status,created_at,updated_at")
          .single()
      : await context.supabase
          .from("inbound_integrations")
          .insert(record)
          .select("id,provider,display_name,status,created_at,updated_at")
          .single();
    if (writeError) {
      await context.supabase.rpc("delete_credential_secret", { p_id: secretId });
      throw new Error("Could not save your Telegram integration.");
    }

    const oldSecretId = existing?.credential_reference.match(
      /^credential:\/\/telegram\/([0-9a-f-]{36})$/i,
    )?.[1];
    if (oldSecretId && oldSecretId !== secretId) {
      await context.supabase.rpc("delete_credential_secret", { p_id: oldSecretId });
    }
    return integration;
  });

export const deleteInboundIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => ({ id: input.id }))
  .handler(async ({ data, context }) => {
    const { data: integration, error: readError } = await context.supabase
      .from("inbound_integrations")
      .select("credential_reference")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (readError) throw new Error("Could not read the integration.");
    if (!integration) throw new Error("Integration not found.");

    const { error: deleteError } = await context.supabase
      .from("inbound_integrations")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (deleteError) throw new Error("Could not remove the integration.");

    const secretId = integration.credential_reference.match(
      /^credential:\/\/telegram\/([0-9a-f-]{36})$/i,
    )?.[1];
    if (secretId) {
      const { error } = await context.supabase.rpc("delete_credential_secret", {
        p_id: secretId,
      });
      if (error) throw new Error("Integration removed, but its credential could not be deleted.");
    }
    return { ok: true };
  });
