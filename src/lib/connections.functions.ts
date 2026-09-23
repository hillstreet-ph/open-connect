import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeConnectionSetup, type ConnectionSetupInput } from "@/lib/connection-setup";

/**
 * Connection catalog — professional app plane.
 * Connect records a pending authorization request server-side.
 * Agents never receive provider tokens; they present oc_live_ keys only.
 */
const CATALOG = [
  // Development
  {
    provider: "github",
    display_name: "GitHub",
    category: "Development",
    scopes: ["repo", "read:user", "workflow"],
    oauth: true,
  },
  {
    provider: "dockerhub",
    display_name: "Docker Hub",
    category: "Development",
    scopes: ["repositories:read", "repositories:write"],
    oauth: false,
  },
  {
    provider: "gitlab",
    display_name: "GitLab",
    category: "Development",
    scopes: ["api", "read_user"],
    oauth: true,
  },
  {
    provider: "linear",
    display_name: "Linear",
    category: "Development",
    scopes: ["read", "write"],
    oauth: true,
  },
  {
    provider: "jira",
    display_name: "Jira",
    category: "Development",
    scopes: ["read:jira-work", "write:jira-work"],
    oauth: true,
  },
  {
    provider: "cursor",
    display_name: "Cursor",
    category: "Development",
    scopes: ["mcp"],
    oauth: false,
  },
  // Communication
  {
    provider: "telegram",
    display_name: "Telegram",
    category: "Communication",
    scopes: ["bot"],
    oauth: false,
  },
  {
    provider: "slack",
    display_name: "Slack",
    category: "Communication",
    scopes: ["chat:write", "channels:read", "users:read"],
    oauth: true,
  },
  {
    provider: "discord",
    display_name: "Discord",
    category: "Communication",
    scopes: ["bot", "applications.commands"],
    oauth: true,
  },
  {
    provider: "gmail",
    display_name: "Gmail",
    category: "Communication",
    scopes: ["gmail.readonly", "gmail.send"],
    oauth: true,
  },
  // AI clients & gateways
  {
    provider: "chatgpt",
    display_name: "ChatGPT / OpenAI",
    category: "AI",
    scopes: ["models", "plugins", "mcp", "actions"],
    oauth: true,
  },
  {
    provider: "claude",
    display_name: "Claude / Anthropic",
    category: "AI",
    scopes: ["models", "mcp", "plugins"],
    oauth: true,
  },
  {
    provider: "grok",
    display_name: "Grok / xAI",
    category: "AI",
    scopes: ["models", "mcp", "tools"],
    oauth: true,
  },
  {
    provider: "hermes",
    display_name: "Hermes Agent",
    category: "AI",
    scopes: ["mcp"],
    oauth: false,
  },
  {
    provider: "openwebui",
    display_name: "Open WebUI",
    category: "AI",
    scopes: ["models", "tools", "mcp"],
    oauth: false,
  },
  {
    provider: "openai",
    display_name: "OpenAI API",
    category: "AI",
    scopes: ["models"],
    oauth: false,
  },
  {
    provider: "openrouter",
    display_name: "OpenRouter",
    category: "AI",
    scopes: ["models"],
    oauth: false,
  },
  {
    provider: "anthropic",
    display_name: "Anthropic API",
    category: "AI",
    scopes: ["models"],
    oauth: false,
  },
  {
    provider: "google",
    display_name: "Google Gemini API",
    category: "AI",
    scopes: ["models"],
    oauth: false,
  },
  {
    provider: "xai",
    display_name: "xAI API",
    category: "AI",
    scopes: ["models"],
    oauth: false,
  },
  {
    provider: "mistral",
    display_name: "Mistral API",
    category: "AI",
    scopes: ["models"],
    oauth: false,
  },
  {
    provider: "deepseek",
    display_name: "DeepSeek API",
    category: "AI",
    scopes: ["models"],
    oauth: false,
  },
  {
    provider: "litellm",
    display_name: "LiteLLM",
    category: "AI",
    scopes: ["models", "proxy"],
    oauth: false,
  },
  {
    provider: "lobehub",
    display_name: "LobeHub",
    category: "AI",
    scopes: ["models", "agents", "mcp"],
    oauth: false,
  },
  {
    provider: "multion",
    display_name: "MultiOn",
    category: "AI",
    scopes: ["browse", "sessions"],
    oauth: false,
  },
  // Automation / integration platforms
  {
    provider: "pipedream",
    display_name: "Pipedream",
    category: "Automation",
    scopes: ["workflows", "components", "api"],
    oauth: true,
  },
  {
    provider: "composio",
    display_name: "Composio",
    category: "Automation",
    scopes: ["tools", "actions", "triggers"],
    oauth: true,
  },
  {
    provider: "slimtools",
    display_name: "Slimtools",
    category: "Automation",
    scopes: ["tools", "api"],
    oauth: false,
  },
  // Secrets / productivity
  {
    provider: "1password",
    display_name: "1Password",
    category: "Security",
    scopes: ["vaults:read", "items:read"],
    oauth: true,
  },
  {
    provider: "google_drive",
    display_name: "Google Drive",
    category: "Productivity",
    scopes: ["drive.readonly", "drive.file"],
    oauth: true,
  },
  {
    provider: "google_calendar",
    display_name: "Google Calendar",
    category: "Productivity",
    scopes: ["calendar.readonly", "calendar.events"],
    oauth: true,
  },
  {
    provider: "notion",
    display_name: "Notion",
    category: "Productivity",
    scopes: ["read_content", "update_content"],
    oauth: true,
  },
  // Infrastructure
  {
    provider: "cloudflare",
    display_name: "Cloudflare",
    category: "Infrastructure",
    scopes: ["zone:read", "zone:edit", "pages", "workers"],
    oauth: false,
  },
  {
    provider: "sentry",
    display_name: "Sentry",
    category: "Infrastructure",
    scopes: ["org:read", "project:read", "event:read"],
    oauth: false,
  },
  {
    provider: "zeabur",
    display_name: "Zeabur",
    category: "Infrastructure",
    scopes: ["projects:read", "services:read", "services:write"],
    oauth: false,
  },
  {
    provider: "e2b",
    display_name: "E2B Sandboxes",
    category: "Infrastructure",
    scopes: ["sandboxes:read", "sandboxes:create", "sandboxes:kill"],
    oauth: false,
  },
  {
    provider: "hubstaff_admin",
    display_name: "Hubstaff Admin",
    category: "Business",
    scopes: ["hubstaff:read", "hubstaff:write", "tasks:read", "tasks:write"],
    oauth: false,
  },
  {
    provider: "supabase",
    display_name: "Supabase",
    category: "Data",
    scopes: ["projects:read", "db", "storage"],
    oauth: false,
  },
  {
    provider: "databricks",
    display_name: "Databricks",
    category: "Data",
    scopes: ["workspace", "sql", "catalog"],
    oauth: false,
  },
  {
    provider: "stripe",
    display_name: "Stripe",
    category: "Business",
    scopes: ["read", "write"],
    oauth: false,
  },
  {
    provider: "hubspot",
    display_name: "HubSpot",
    category: "Business",
    scopes: ["crm.objects.contacts.read"],
    oauth: true,
  },
  {
    provider: "airtable",
    display_name: "Airtable",
    category: "Data",
    scopes: [
      "data.records:read",
      "data.records:write",
      "schema.bases:read",
      "schema.bases:write",
      "webhook:manage",
    ],
    oauth: true,
  },
  {
    provider: "custom_mcp",
    display_name: "Custom MCP server",
    category: "Custom",
    scopes: ["tools:list", "tools:invoke"],
    oauth: false,
  },
] as const;

export const listConnectionCatalog = createServerFn({ method: "GET" }).handler(async () => {
  return CATALOG.map((item) => ({
    provider: item.provider,
    display_name: item.display_name,
    category: item.category,
    scopes: [...item.scopes],
    oauth: item.oauth,
  }));
});

export const listAppConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("app_connections")
      .select(
        "id, provider, display_name, status, scopes, provider_account_id, last_used_at, created_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const connectApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { provider: string }) => ({
    provider: (input?.provider ?? "").trim().toLowerCase(),
  }))
  .handler(async ({ data, context }) => {
    const app = CATALOG.find((item) => item.provider === data.provider);
    if (!app) throw new Error("Unknown application");

    const authorizationMode = app.oauth ? "oauth" : "brokered_secret";

    const { data: existing } = await context.supabase
      .from("app_connections")
      .select("id")
      .eq("provider", app.provider)
      .eq("user_id", context.userId)
      .maybeSingle();

    if (existing) {
      const { data: updated, error } = await context.supabase
        .from("app_connections")
        .update({
          status: "pending",
          scopes: [],
          credential_reference: null,
          display_name: app.display_name,
          metadata: {
            source: "open-connect",
            mode: authorizationMode,
            authorization_required: true,
            requested_scopes: [...app.scopes],
            full_scopes: false,
          },
        })
        .eq("id", existing.id)
        .select("id, provider, display_name, status, scopes, created_at")
        .single();
      if (error) throw new Error(error.message);
      return updated;
    }

    const { data: inserted, error } = await context.supabase
      .from("app_connections")
      .insert({
        user_id: context.userId,
        provider: app.provider,
        display_name: app.display_name,
        status: "pending",
        scopes: [],
        credential_reference: null,
        provider_account_id: null,
        metadata: {
          source: "open-connect",
          mode: authorizationMode,
          authorization_required: true,
          requested_scopes: [...app.scopes],
          full_scopes: false,
        },
      })
      .select("id, provider, display_name, status, scopes, created_at")
      .single();
    if (error) throw new Error(error.message);
    return inserted;
  });

export const disconnectApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => ({ id: input.id }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("app_connections").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const configureAppConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: ConnectionSetupInput) => input)
  .handler(async ({ data, context }) => {
    const app = CATALOG.find((item) => item.provider === data.provider.trim().toLowerCase());
    if (!app) throw new Error("Unknown application");
    const setup = normalizeConnectionSetup(data, app);
    const secretPayload = JSON.stringify({
      version: 1,
      auth_type: setup.authType,
      credential: setup.apiKey,
    });
    const { data: secret, error: secretError } = await context.supabase.rpc(
      "create_credential_secret",
      {
        p_name: `${setup.displayName} · ${setup.accountLabel}`,
        p_secret_type: "api_key",
        p_scopes: ["connections"],
        p_secret_value: secretPayload,
      },
    );
    if (secretError) throw new Error(secretError.message);

    const secretId = String((secret as { id?: string } | null)?.id ?? "");
    if (!secretId) throw new Error("Credential vault did not return a reference");
    const accountId =
      setup.provider === "custom_mcp"
        ? `${setup.accountLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${secretId.slice(0, 8)}`
        : null;
    const record = {
      user_id: context.userId,
      provider: setup.provider,
      display_name: setup.displayName,
      provider_account_id: accountId,
      status: "connected",
      scopes: [...setup.app.scopes],
      credential_reference: `credential://${setup.provider}/${secretId}`,
      metadata: {
        source: "open-connect",
        mode: setup.provider === "custom_mcp" ? "custom_mcp" : "brokered_secret",
        auth_type: setup.authType,
        account_label: setup.accountLabel,
        endpoint_url: setup.endpointUrl || null,
        full_scopes: false,
      },
    };

    const existing =
      setup.provider === "custom_mcp"
        ? null
        : await context.supabase
            .from("app_connections")
            .select("id")
            .eq("user_id", context.userId)
            .eq("provider", setup.provider)
            .is("provider_account_id", null)
            .maybeSingle();
    const query = existing?.data?.id
      ? context.supabase.from("app_connections").update(record).eq("id", existing.data.id)
      : context.supabase.from("app_connections").insert(record);
    const { data: connection, error } = await query
      .select("id, provider, display_name, status, scopes, provider_account_id, created_at")
      .single();
    if (error) throw new Error(error.message);
    return connection;
  });
