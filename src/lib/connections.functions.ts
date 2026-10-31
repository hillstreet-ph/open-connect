import { connectionUsesBrowserLogin } from "./connection-login.ts";
import { connectionOwnedSecretId } from "./connection-credential-lifecycle";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  duplicateConnectionSetup,
  normalizeConnectionSetup,
  type ConnectionSetupInput,
} from "@/lib/connection-setup";
import { AI_GATEWAY_PROVIDERS } from "@/lib/ai-gateway-providers";
import { hasRole, type AppRole } from "@/lib/rbac";
import { composioImportBatches } from "@/lib/composio-sync";
import {
  connectionIdentity,
  connectionAuthType,
  connectionEndpoint,
} from "@/lib/connection-presentation";

/**
 * Connection catalog — professional app plane.
 * Connect records a pending authorization request server-side.
 * Agents never receive provider tokens; they present oc_live_ keys only.
 */
const CATALOG = [
  {
    provider: "custom_api",
    display_name: "Custom API profile",
    category: "Custom",
    scopes: [],
    oauth: false,
  },
  {
    provider: "cloudflare_api_key",
    display_name: "Cloudflare API",
    category: "Infrastructure",
    scopes: [],
    oauth: true,
  },
  {
    provider: "cloudflare_browser_rendering",
    display_name: "Cloudflare Browser Rendering",
    category: "Infrastructure",
    scopes: [],
    oauth: true,
  },
  {
    provider: "railway",
    display_name: "Railway",
    category: "Infrastructure",
    scopes: [],
    oauth: true,
  },
  // Existing Composio toolkits use hosted authorization when configured.
  {
    provider: "google_sheets",
    display_name: "Google Sheets",
    category: "Productivity",
    scopes: [],
    oauth: true,
  },
  {
    provider: "google_docs",
    display_name: "Google Docs",
    category: "Productivity",
    scopes: [],
    oauth: true,
  },
  {
    provider: "google_photos",
    display_name: "Google Photos",
    category: "Productivity",
    scopes: [],
    oauth: true,
  },
  {
    provider: "google_super",
    display_name: "Google Workspace",
    category: "Productivity",
    scopes: [],
    oauth: true,
  },
  {
    provider: "firecrawl",
    display_name: "Firecrawl",
    category: "Data",
    scopes: [],
    oauth: true,
  },
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
    provider: "proton_pass",
    display_name: "Proton Pass",
    category: "Security",
    scopes: ["vaults:read", "items:read"],
    oauth: false,
  },
  {
    provider: "proton_drive",
    display_name: "Proton Drive",
    category: "Productivity",
    scopes: ["files:read", "folders:write"],
    oauth: false,
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
    provider: "browser_use",
    display_name: "Browser Use V4",
    category: "Infrastructure",
    scopes: ["browser:run", "browser:sessions"],
    oauth: false,
  },
  {
    provider: "browserbase",
    display_name: "Browserbase",
    category: "Infrastructure",
    scopes: ["browser:sessions"],
    oauth: false,
  },
  {
    provider: "tinyfish",
    display_name: "TinyFish Cloud Browser",
    category: "Infrastructure",
    scopes: ["browser:run", "browser:sessions", "profiles:read"],
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
    category: "Automation",
    scopes: ["tools:list", "tools:invoke"],
    oauth: false,
  },
] as const;

export const listConnectionCatalog = createServerFn({ method: "GET" }).handler(async () => {
  const { managedConnectorReady, connectionMethod, listComposioToolkits } =
    await import("@/lib/managed-connectors.server");
  const githubReady = Boolean(
    process.env["GITHUB_CLIENT_ID"]?.trim() && process.env["GITHUB_CLIENT_SECRET"]?.trim(),
  );
  const toolkits = await listComposioToolkits();
  const toolkitBySlug = new Map(toolkits.map((toolkit) => [toolkit.slug, toolkit]));
  const catalog = new Map<
    string,
    {
      provider: string;
      display_name: string;
      category: string;
      scopes: readonly string[];
      oauth: boolean;
      auth_methods?: string[];
      logo: string;
    }
  >();
  for (const item of CATALOG) catalog.set(item.provider, { ...item, logo: "" });
  for (const toolkit of toolkits) {
    if (catalog.has(toolkit.slug)) continue;
    catalog.set(toolkit.slug, {
      provider: toolkit.slug,
      display_name: toolkit.name,
      category: toolkit.category,
      scopes: [],
      oauth: toolkit.authMethods.includes("OAUTH2"),
      auth_methods: toolkit.authMethods,
      logo: toolkit.logo,
    });
  }
  // Curated catalog entries that match a toolkit slug keep their entry but
  // still receive the official Composio mark for that toolkit.
  for (const toolkit of toolkits) {
    const curated = catalog.get(toolkit.slug);
    if (curated && curated.logo === "") curated.logo = toolkit.logo;
  }
  return [...catalog.values()].map((item) => {
    const toolkit = toolkitBySlug.get(item.provider);
    const dynamicallyConnectable = Boolean(toolkit && process.env["COMPOSIO_API_KEY"]?.trim());
    const ready = managedConnectorReady(item.provider) || dynamicallyConnectable;
    // Toolkits without an OAuth scheme accept only API keys or tokens, so they
    // must never be routed to hosted authorization.
    const oauthSchemes = (toolkit?.authMethods ?? []).some((scheme) =>
      ["OAUTH2", "OAUTH1"].includes(scheme.toUpperCase()),
    );
    const oauthCapable = toolkit ? oauthSchemes : item.oauth;
    // The cloud browser calls TinyFish's REST API with a vault-held key, so it
    // must not be routed to a brokered OAuth account it cannot use.
    const method =
      ["tinyfish", "browser_use", "browserbase"].includes(item.provider) ||
      (!oauthCapable && !managedConnectorReady(item.provider))
        ? "api_key"
        : connectionMethod(item.provider, oauthCapable, ready);
    return {
      provider: item.provider,
      display_name: item.display_name,
      category: item.category,
      logo: item.logo,
      scopes: [...item.scopes],
      auth_methods:
        item.auth_methods ??
        toolkit?.authMethods ??
        (item.provider === "custom_mcp" ? ["MCP"] : []),
      oauth: method !== "api_key",
      oauth_supported: method !== "api_key" && (method === "native_oauth" || oauthCapable),
      connection_method: method,
      oauth_ready:
        method === "native_oauth" ? githubReady : method === "managed_oauth" ? ready : false,
    };
  });
});

export const listAppConnections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("app_connections")
      .select(
        "id, provider, display_name, status, scopes, provider_account_id, credential_reference, metadata, last_used_at, created_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const connections = data ?? [];
    const providerLogos = new Map<string, string>();
    try {
      const { listComposioToolkits } = await import("@/lib/managed-connectors.server");
      for (const toolkit of await listComposioToolkits()) {
        providerLogos.set(toolkit.slug, toolkit.logo);
      }
    } catch {
      // Official catalog logos are best-effort; connections stay fully usable without them.
    }
    const pendingManaged = connections.filter(
      (connection) =>
        connection.status === "pending" &&
        connection.credential_reference?.startsWith("composio://connected-account/"),
    );
    if (pendingManaged.length) {
      const { getManagedConnection } = await import("@/lib/managed-connectors.server");
      await Promise.all(
        pendingManaged.map(async (connection) => {
          const accountId = connection.credential_reference!.split("/").pop()!;
          try {
            const remote = await getManagedConnection(connection.provider, accountId);
            if (remote.status?.toUpperCase() !== "ACTIVE") return;
            const { error: updateError } = await context.supabase
              .from("app_connections")
              .update({
                status: "connected",
                provider_account_id: remote.id || accountId,
                metadata: {
                  source: "open-connect",
                  mode: "managed_oauth",
                  broker: "composio",
                  validation: {
                    verified: true,
                    checked_at: new Date().toISOString(),
                  },
                  full_scopes: false,
                },
              })
              .eq("id", connection.id);
            if (updateError) throw new Error("Could not save verified connection status");
            connection.status = "connected";
            connection.provider_account_id = remote.id || accountId;
            connection.scopes = [];
          } catch {
            // Keep pending. The broker may still be waiting for the user to finish authorization.
          }
        }),
      );
    }
    // Professional account identity: resolve the connected provider account
    // (which Google, GitHub, or Gmail account) once through the provider's
    // read-only profile endpoint and store it so account cards stay labeled.
    const managedConnected = connections.filter(
      (connection) =>
        connection.status === "connected" &&
        connection.credential_reference?.startsWith("composio://connected-account/"),
    );
    if (managedConnected.length) {
      const { getManagedAccountIdentity } = await import("@/lib/managed-connectors.server");
      await Promise.all(
        managedConnected.map(async (connection) => {
          const current = connectionIdentity(connection.metadata);
          if (current.email || current.login || current.name) return;
          const existingMetadata = (connection.metadata as Record<string, unknown> | null) ?? {};
          const attemptedAt = Date.parse(String(existingMetadata["identity_checked_at"] ?? ""));
          if (Number.isFinite(attemptedAt) && Date.now() - attemptedAt < 24 * 3600_000) return;
          const accountId = connection.credential_reference!.split("/").pop()!;
          const metadata = { ...existingMetadata };
          try {
            const identity = await getManagedAccountIdentity(
              connection.provider,
              accountId,
              context.userId,
            );
            if (identity && (identity.email || identity.login || identity.name)) {
              metadata["account_login"] = identity.login;
              metadata["account_name"] = identity.name;
              metadata["account_email"] = identity.email;
            } else {
              metadata["identity_checked_at"] = new Date().toISOString();
            }
          } catch {
            metadata["identity_checked_at"] = new Date().toISOString();
          }
          const { error: updateError } = await context.supabase
            .from("app_connections")
            .update({ metadata: metadata as unknown as Record<string, string> })
            .eq("id", connection.id);
          if (updateError) return;
          connection.metadata = metadata as typeof connection.metadata;
        }),
      );
    }
    return connections.map(({ credential_reference, metadata, ...connection }) => {
      const isModelGateway = AI_GATEWAY_PROVIDERS.some(
        (provider) => provider.id === connection.provider,
      );
      const hasGatewayReference = Boolean(
        credential_reference?.match(
          new RegExp(`^credential://${connection.provider}/([0-9a-f-]{36})$`, "i"),
        ),
      );
      return {
        ...connection,
        logo: providerLogos.get(connection.provider) ?? "",
        browser_login: connectionUsesBrowserLogin({ credential_reference, metadata }),
        identity: connectionIdentity(metadata),
        metadata:
          [
            "custom_mcp",
            "custom_api",
            "proton_pass",
            "proton_drive",
            "supabase",
            "databricks",
            "litellm",
          ].includes(connection.provider) &&
          metadata &&
          typeof metadata === "object" &&
          !Array.isArray(metadata)
            ? {
                endpoint_url:
                  connection.provider === "custom_mcp" &&
                  typeof metadata["endpoint_url"] === "string"
                    ? metadata["endpoint_url"]
                    : connectionEndpoint(metadata["endpoint_url"]),
                transport: String(metadata["transport"] || "http"),
                icon_data: String(metadata["icon_data"] || ""),
                capabilities: metadata["capabilities"] || null,
                openapi: metadata["openapi"] || null,
                oauth_client_id: String(metadata["oauth_client_id"] || ""),
                oauth_issuer: String(metadata["oauth_issuer"] || ""),
                disabled_tools: Array.isArray(metadata["disabled_tools"])
                  ? (metadata["disabled_tools"] as string[])
                  : [],
                auth_type: connectionAuthType(metadata),
                auth_header:
                  typeof metadata["auth_header"] === "string"
                    ? metadata["auth_header"]
                    : "X-API-Key",
                description:
                  typeof metadata["description"] === "string"
                    ? metadata["description"].slice(0, 1000)
                    : "",
              }
            : {},
        ...(isModelGateway
          ? {
              gateway_ready: connection.status === "connected" && hasGatewayReference,
            }
          : {}),
      };
    });
  });

export const syncComposioConnections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roleRows, error: roleError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (roleError) throw new Error(roleError.message);
    const roles = (roleRows ?? []).map((row: { role: AppRole }) => row.role);
    const effectiveRoles: AppRole[] = roles.length ? roles : ["user"];
    if (!hasRole(effectiveRoles, "admin")) {
      throw new Error("Forbidden: admin required");
    }

    const { listOwnedManagedConnections, listComposioToolkits } =
      await import("@/lib/managed-connectors.server");
    const [accounts, toolkits] = await Promise.all([
      listOwnedManagedConnections(context.userId),
      listComposioToolkits(),
    ]);
    const syncCatalog = new Map<string, { display_name: string }>(
      CATALOG.map((item) => [item.provider, { display_name: item.display_name }]),
    );
    for (const toolkit of toolkits) {
      if (!syncCatalog.has(toolkit.slug))
        syncCatalog.set(toolkit.slug, { display_name: toolkit.name });
    }
    const saved: Array<{
      provider: string;
      provider_account_id: string | null;
      credential_reference: string | null;
    }> = [];
    for (let offset = 0; ; offset += 200) {
      const { data, error } = await context.supabase
        .from("app_connections")
        .select("provider,provider_account_id,credential_reference")
        .eq("user_id", context.userId)
        .order("id")
        .range(offset, offset + 199);
      if (error) throw new Error(error.message);
      saved.push(...(data ?? []));
      if ((data?.length ?? 0) < 200) break;
    }
    const plan = composioImportBatches(
      context.userId,
      accounts,
      saved,
      [...syncCatalog].map(([slug, app]) => ({ slug, name: app.display_name })),
    );
    let imported = 0;
    for (const records of plan.batches) {
      const { error } = await context.supabase.from("app_connections").insert(records);
      if (error?.code === "23505") {
        throw new Error("Another sync updated these accounts. Run sync again to refresh.");
      }
      if (error) throw new Error(error.message);
      imported += records.length;
    }
    return { imported, existing: plan.existing, matched: plan.matched };
  });

/** Composio toolkit slug aliases so AI Gateway providers can use hosted sign-in. */
const AI_GATEWAY_COMPOSIO_SLUGS: Record<string, string[]> = {
  openai: ["openai"],
  anthropic: ["anthropic"],
  google: ["gemini"],
  mistral: ["mistral", "mistral_ai"],
  deepseek: ["deepseek"],
  groq: ["groq", "groqcloud"],
  xai: ["grok", "xai", "x_ai"],
  huggingface: ["hugging_face", "huggingface"],
  nvidia: ["nvidia", "nvidia_nim", "nim"],
  openrouter: ["openrouter"],
  ollama_cloud: ["ollama", "ollama_cloud"],
  kilo: ["kilocode", "kilo"],
};

export const connectApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { provider: string; connection_id?: string }) => ({
    provider: (input?.provider ?? "").trim().toLowerCase(),
    connection_id: input?.connection_id,
  }))
  .handler(async ({ data, context }) => {
    const { managedConnectorReady, connectionMethod, listComposioToolkits } =
      await import("@/lib/managed-connectors.server");
    const toolkits = await listComposioToolkits();
    const candidateSlugs = [data.provider, ...(AI_GATEWAY_COMPOSIO_SLUGS[data.provider] ?? [])];
    const toolkit = toolkits.find((item) => candidateSlugs.includes(item.slug));
    const gatewayProvider = AI_GATEWAY_PROVIDERS.find((item) => item.id === data.provider);
    const app =
      CATALOG.find((item) => item.provider === data.provider) ??
      (toolkit
        ? {
            provider: toolkit.slug,
            display_name: toolkit.name,
            category: toolkit.category,
            scopes: [] as string[],
            oauth: toolkit.authMethods.includes("OAUTH2"),
          }
        : gatewayProvider
          ? {
              provider: gatewayProvider.id,
              display_name: gatewayProvider.name,
              scopes: [] as string[],
              oauth: true,
            }
          : undefined);
    if (!app) throw new Error("Unknown application");
    const ready = managedConnectorReady(app.provider) || Boolean(toolkit);
    // Toolkits without an OAuth scheme accept only API keys or tokens; routing
    // them to hosted authorization fails with a broker credentials error.
    const oauthSchemes = (toolkit?.authMethods ?? []).some((scheme) =>
      ["OAUTH2", "OAUTH1"].includes(scheme.toUpperCase()),
    );
    const oauthCapable = toolkit ? oauthSchemes : app.oauth;
    const method =
      ["tinyfish", "browser_use", "browserbase"].includes(app.provider) ||
      (!oauthCapable && !managedConnectorReady(app.provider))
        ? "api_key"
        : connectionMethod(app.provider, oauthCapable, ready);
    if (method === "api_key")
      throw new Error(
        `${app.display_name} connects with an API key or token. Use its Connect account dialog to add the credential.`,
      );

    if (method === "managed_oauth") {
      const { createManagedConnectionLink } = await import("@/lib/managed-connectors.server");
      const callbackUrl = `${(process.env["VITE_APP_URL"] || "https://open-connect.site").replace(
        /\/$/,
        "",
      )}/connections?connected=${encodeURIComponent(app.provider)}`;
      let link: Awaited<ReturnType<typeof createManagedConnectionLink>>;
      try {
        link = await createManagedConnectionLink({
          provider: app.provider,
          toolkitSlug: toolkit?.slug ?? app.provider,
          userId: context.userId,
          callbackUrl,
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : "broker error";
        throw new Error(
          `Hosted sign-in is not available for ${app.display_name}. Connect it with an API key or token instead. (${detail})`,
          { cause: error },
        );
      }
      const record = {
        user_id: context.userId,
        provider: app.provider,
        display_name: app.display_name,
        status: "pending",
        scopes: [] as string[],
        credential_reference: `composio://connected-account/${link.connected_account_id}`,
        provider_account_id: link.connected_account_id,
        metadata: {
          source: "open-connect",
          mode: "managed_oauth",
          broker: "composio",
          authorization_required: true,
          requested_scopes: [...app.scopes],
          expires_at: link.expires_at,
          full_scopes: false,
        },
      };
      const { data: connection, error } = await context.supabase
        .from("app_connections")
        // Every hosted authorization creates a new opaque connected-account ID.
        // Insert directly because the database protects this tuple with an
        // expression index (COALESCE(provider_account_id, '')), which cannot be
        // addressed by PostgREST's column-only onConflict parameter.
        .insert(record)
        .select("id,provider,display_name,status,scopes,created_at")
        .single();
      if (error) throw new Error(error.message);
      return { ...connection, authorization_url: link.redirect_url };
    }

    const { buildGitHubAuthorizationUrl, oauthConfig, sha256 } =
      await import("@/lib/provider-oauth.server");
    const config = oauthConfig(app.provider);
    if (data.connection_id) {
      const { data: target, error } = await context.supabase
        .from("app_connections")
        .select("id")
        .eq("id", data.connection_id)
        .eq("user_id", context.userId)
        .eq("provider", app.provider)
        .single();
      if (error || !target) throw new Error("Reconnect account not found.");
    }
    const state = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    const stateHash = await sha256(state);
    const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();

    const { data: existing, error: existingError } = await context.supabase
      .from("app_connections")
      .select("id,credential_reference")
      .eq("provider", app.provider)
      .eq("user_id", context.userId)
      .is("provider_account_id", null)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);

    const record = {
      user_id: context.userId,
      provider: app.provider,
      display_name: app.display_name,
      status: "pending",
      scopes: [] as string[],
      provider_account_id: null,
      metadata: {
        source: "open-connect",
        mode: "oauth",
        authorization_required: true,
        requested_scopes: [...app.scopes],
        oauth_state_hash: stateHash,
        oauth_state_expires_at: expiresAt,
        reconnect_connection_id: data.connection_id ?? null,
        full_scopes: false,
      },
    };

    const query = existing?.id
      ? context.supabase.from("app_connections").update(record).eq("id", existing.id)
      : context.supabase.from("app_connections").insert({ ...record, credential_reference: null });
    const { data: connection, error } = await query
      .select("id, provider, display_name, status, scopes, created_at")
      .single();
    if (error) throw new Error(error.message);

    return {
      ...connection,
      authorization_url: buildGitHubAuthorizationUrl({
        clientId: config.clientId,
        appUrl: config.appUrl,
        state,
      }),
    };
  });

export const completeOAuthConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { provider: string; code: string; state: string }) => ({
    provider: (input?.provider ?? "").trim().toLowerCase(),
    code: (input?.code ?? "").trim(),
    state: (input?.state ?? "").trim(),
  }))
  .handler(async ({ data, context }) => {
    if (!data.code || !data.state) throw new Error("The provider callback is incomplete.");

    const { exchangeGitHubCode, oauthConfig, sha256, selectOAuthConnectionTarget } =
      await import("@/lib/provider-oauth.server");
    const config = oauthConfig(data.provider);
    const { data: pending, error: pendingError } = await context.supabase
      .from("app_connections")
      .select("id,metadata,credential_reference")
      .eq("user_id", context.userId)
      .eq("provider", data.provider)
      .eq("status", "pending")
      .is("provider_account_id", null)
      .maybeSingle();
    if (pendingError) throw new Error(pendingError.message);
    if (!pending) throw new Error("No matching authorization request was found.");

    const metadata = (pending.metadata ?? {}) as Record<string, unknown>;
    const expectedHash = String(metadata["oauth_state_hash"] ?? "");
    const expiresAt = Date.parse(String(metadata["oauth_state_expires_at"] ?? ""));
    const actualHash = await sha256(data.state);
    if (
      !expectedHash ||
      actualHash !== expectedHash ||
      !Number.isFinite(expiresAt) ||
      expiresAt < Date.now()
    ) {
      throw new Error(
        "The authorization request expired or failed state verification. Start again.",
      );
    }

    const verified = await exchangeGitHubCode({
      code: data.code,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      appUrl: config.appUrl,
    });
    const reconnectId =
      typeof metadata["reconnect_connection_id"] === "string"
        ? metadata["reconnect_connection_id"]
        : null;
    const { data: matching, error: matchError } = await context.supabase
      .from("app_connections")
      .select("id,provider_account_id,credential_reference")
      .eq("user_id", context.userId)
      .eq("provider", data.provider)
      .eq("provider_account_id", verified.accountId)
      .maybeSingle();
    if (matchError) throw new Error("Could not verify the existing provider account.");
    const target = selectOAuthConnectionTarget(pending, matching, reconnectId);
    const { data: secret, error: secretError } = await context.supabase.rpc(
      "create_credential_secret",
      {
        p_name: `GitHub OAuth · ${verified.accountLogin}`,
        p_secret_type: "oauth_token",
        p_scopes: ["connections"],
        p_secret_value: JSON.stringify({
          version: 1,
          auth_type: "oauth",
          credential: verified.accessToken,
        }),
      },
    );
    if (secretError) throw new Error(secretError.message);
    const secretId = String((secret as { id?: string } | null)?.id ?? "");
    if (!secretId) throw new Error("Credential Vault did not return a reference.");

    const { data: connected, error: updateError } = await context.supabase
      .from("app_connections")
      .update({
        status: "connected",
        scopes: verified.scopes,
        credential_reference: `credential://github/${secretId}`,
        provider_account_id: verified.accountId,
        metadata: {
          source: "open-connect",
          mode: "oauth",
          account_login: verified.accountLogin,
          validation: { verified: true, checked_at: new Date().toISOString() },
          full_scopes: false,
        },
      })
      .eq("id", target.id)
      .eq("user_id", context.userId)
      .select("id,provider,display_name,status,scopes,provider_account_id,created_at")
      .single();
    if (updateError) {
      await context.supabase.rpc("delete_credential_secret", {
        p_id: secretId,
      });
      throw new Error(updateError.message);
    }

    if (target.id !== pending.id) {
      await context.supabase
        .from("app_connections")
        .delete()
        .eq("id", pending.id)
        .eq("user_id", context.userId)
        .eq("status", "pending");
    }
    const oldSecretId = target.credential_reference?.match(
      /^credential:\/\/[^/]+\/([0-9a-f-]{36})$/i,
    )?.[1];
    if (oldSecretId && oldSecretId !== secretId) {
      await context.supabase.rpc("delete_credential_secret", {
        p_id: oldSecretId,
      });
    }
    return connected;
  });

export const disconnectApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string }) => ({ id: input.id }))
  .handler(async ({ data, context }) => {
    const { data: connection, error: readError } = await context.supabase
      .from("app_connections")
      .select("provider,credential_reference,metadata")
      .eq("user_id", context.userId)
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    const managedAccountId = connection?.credential_reference?.match(
      /^composio:\/\/connected-account\/([^/]+)$/,
    )?.[1];
    const imported =
      (connection?.metadata as Record<string, unknown> | null)?.["source"] === "composio-sync";
    if (managedAccountId && connection?.provider && !imported) {
      const { deleteManagedConnection } = await import("@/lib/managed-connectors.server");
      await deleteManagedConnection(connection.provider, managedAccountId);
    }
    const { error } = await context.supabase
      .from("app_connections")
      .delete()
      .eq("user_id", context.userId)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    const secretId = connectionOwnedSecretId(
      connection?.credential_reference,
      connection?.metadata,
    );
    if (secretId)
      await context.supabase.rpc("delete_credential_secret", {
        p_id: secretId,
      });
    return { ok: true };
  });

export const renameAppConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: string; display_name?: string; account_label?: string }) => input)
  .handler(async ({ data, context }) => {
    const displayName = (data.display_name ?? "").trim().slice(0, 120);
    const accountLabel = (data.account_label ?? "").trim().slice(0, 160);
    const { data: existing, error: readError } = await context.supabase
      .from("app_connections")
      .select("id, metadata")
      .eq("user_id", context.userId)
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!existing) throw new Error("Connection not found.");
    const metadata = { ...((existing.metadata as Record<string, unknown> | null) ?? {}) };
    if (accountLabel) metadata["account_label"] = accountLabel;
    const updates = {
      ...(displayName ? { display_name: displayName } : {}),
      metadata: metadata as unknown as Record<string, string>,
    };
    const { error } = await context.supabase
      .from("app_connections")
      .update(updates)
      .eq("user_id", context.userId)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testAiProviderCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { provider: string; api_key: string }) => input)
  .handler(async ({ data }) => {
    const provider = AI_GATEWAY_PROVIDERS.find((item) => item.id === data.provider);
    if (!provider) throw new Error("Unknown AI provider");
    const setup = normalizeConnectionSetup(
      { provider: provider.id, api_key: data.api_key, endpoint_url: provider.baseUrl },
      { provider: provider.id, display_name: provider.name, scopes: [], oauth: false },
    );
    const { validateConnectionCredential } = await import("@/lib/connection-validation.server");
    const result = await validateConnectionCredential(setup);
    if (!result.verified) throw new Error(result.detail);
    return { detail: result.detail };
  });

export const configureAppConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: ConnectionSetupInput) => input)
  .handler(async ({ data, context }) => {
    if (
      data.connection_id &&
      !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(data.connection_id)
    ) {
      throw new Error("Invalid connection reference.");
    }
    const providerId = data.provider.trim().toLowerCase();
    const gatewayProvider = AI_GATEWAY_PROVIDERS.find((item) => item.id === providerId);
    const app =
      CATALOG.find((item) => item.provider === providerId) ??
      (providerId === "custom_mcp"
        ? {
            provider: "custom_mcp",
            display_name: (data.display_name ?? "").trim() || "Custom MCP server",
            scopes: [] as const,
            oauth: false,
          }
        : gatewayProvider
          ? {
              provider: gatewayProvider.id,
              display_name: gatewayProvider.name,
              scopes: [] as const,
              oauth: false,
            }
          : undefined);
    if (!app) throw new Error("Unknown application");
    const setup = normalizeConnectionSetup(data, app);
    let existingQuery = context.supabase
      .from("app_connections")
      .select("id,provider_account_id,credential_reference,metadata,updated_at")
      .eq("user_id", context.userId)
      .eq("provider", setup.provider)
      .order("created_at", { ascending: false });
    if (data.connection_id) existingQuery = existingQuery.eq("id", data.connection_id);
    const { data: existingConnections, error: existingError } = await existingQuery;
    if (existingError) {
      throw new Error("Could not check your existing provider connection.");
    }
    if (
      !data.connection_id &&
      data.new_account === true &&
      duplicateConnectionSetup(setup, existingConnections ?? [])
    ) {
      throw new Error(
        "This endpoint and account label already have a connection. Reconnect the existing account, or use a different account label for a separate identity.",
      );
    }
    const { validateConnectionCredential } = await import("@/lib/connection-validation.server");
    const validation = await validateConnectionCredential(setup);
    let secretId = "";
    if (setup.apiKey) {
      const secretPayload = JSON.stringify({
        version: 1,
        auth_type: setup.authType,
        credential: setup.apiKey,
        auth_header: setup.authHeader,
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
      secretId = String((secret as { id?: string } | null)?.id ?? "");
      if (!secretId) throw new Error("Credential vault did not return a reference");
    }
    const existing = data.connection_id
      ? (existingConnections ?? []).find((item) => item.id === data.connection_id)
      : data.new_account === true
        ? undefined
        : duplicateConnectionSetup(setup, existingConnections ?? []);
    if (data.connection_id && !existing) {
      if (secretId) await context.supabase.rpc("delete_credential_secret", { p_id: secretId });
      throw new Error("Connection not found for this account and provider.");
    }
    const accountId = existing?.provider_account_id ?? `credential-${crypto.randomUUID()}`;
    const record = {
      user_id: context.userId,
      provider: setup.provider,
      display_name: setup.displayName,
      provider_account_id: accountId,
      status: validation.verified ? "connected" : "configured_unverified",
      scopes: [...setup.app.scopes],
      credential_reference: secretId ? `credential://${setup.provider}/${secretId}` : null,
      metadata: {
        disabled_tools: Array.isArray(
          (existing?.metadata as Record<string, unknown> | null)?.["disabled_tools"],
        )
          ? (existing!.metadata as { disabled_tools: unknown[] }).disabled_tools.filter(
              (tool): tool is string => typeof tool === "string",
            )
          : [],
        source: "open-connect",
        mode: setup.provider === "custom_mcp" ? "custom_mcp" : "brokered_secret",
        auth_type: setup.authType,
        account_label: setup.accountLabel,
        description: setup.description,
        transport: setup.transport,
        openapi: setup.openapi ? JSON.parse(JSON.stringify(setup.openapi)) : null,
        icon_data: setup.iconData,
        auth_header: setup.authHeader,
        endpoint_url: setup.endpointUrl || null,
        validation: {
          verified: validation.verified,
          detail: validation.detail,
          provider_account_id: validation.accountId ?? null,
          checked_at: new Date().toISOString(),
        },
        full_scopes: false,
      },
    };

    const query = context.supabase.from("app_connections");
    const { data: connection, error } = existing
      ? await query
          .update(record)
          .eq("id", existing.id)
          .eq("user_id", context.userId)
          .eq("updated_at", existing.updated_at)
          .select("id, provider, display_name, status, scopes, provider_account_id, created_at")
          .single()
      : await query
          .insert(record)
          .select("id, provider, display_name, status, scopes, provider_account_id, created_at")
          .single();
    if (error) {
      if (secretId) {
        await context.supabase.rpc("delete_credential_secret", {
          p_id: secretId,
        });
      }
      throw new Error(error.message);
    }
    const oldReference = existing?.credential_reference;
    const oldSecretId = connectionOwnedSecretId(oldReference, existing?.metadata);
    if (oldSecretId && oldSecretId !== secretId) {
      const { data: references, error: referenceError } = await context.supabase
        .from("app_connections")
        .select("id")
        .eq("credential_reference", oldReference ?? "");
      if (!referenceError && !references?.length) {
        await context.supabase.rpc("delete_credential_secret", {
          p_id: oldSecretId,
        });
      }
    }
    return { ...connection, validation };
  });
