import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeConnectionSetup, type ConnectionSetupInput } from "@/lib/connection-setup";
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
    }
  >();
  for (const item of CATALOG) catalog.set(item.provider, item);
  for (const toolkit of toolkits) {
    if (catalog.has(toolkit.slug)) continue;
    catalog.set(toolkit.slug, {
      provider: toolkit.slug,
      display_name: toolkit.name,
      category: toolkit.category,
      scopes: [],
      oauth: toolkit.authMethods.includes("OAUTH2"),
      auth_methods: toolkit.authMethods,
    });
  }
  return [...catalog.values()].map((item) => {
    const toolkit = toolkitBySlug.get(item.provider);
    const dynamicallyConnectable = Boolean(toolkit && process.env["COMPOSIO_API_KEY"]?.trim());
    const ready = managedConnectorReady(item.provider) || dynamicallyConnectable;
    // The cloud browser calls TinyFish's REST API with a vault-held key, so it
    // must not be routed to a brokered OAuth account it cannot use.
    const method =
      item.provider === "tinyfish" ? "api_key" : connectionMethod(item.provider, item.oauth, ready);
    return {
      provider: item.provider,
      display_name: item.display_name,
      category: item.category,
      scopes: [...item.scopes],
      auth_methods:
        item.auth_methods ??
        toolkit?.authMethods ??
        (item.provider === "custom_mcp" ? ["MCP"] : []),
      oauth: method !== "api_key",
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
        identity: connectionIdentity(metadata),
        metadata:
          ["custom_mcp", "custom_api", "supabase", "databricks", "li…14870 tokens truncated…s('to="/settings"'));
  assert.ok(!userMenu.includes('to="/integrations"'));
  assert.ok(!userMenu.includes('to="/api-keys"'));
  assert.ok(
    settings.indexOf('value="data">Data & privacy') <
      settings.indexOf('value="integrations">Integrations'),
  );
  for (const section of ["api-key", "apps", "ai-agents", "custom-mcp"]) {
    assert.ok(settings.includes('href="/integrations?section=' + section + '"'));
  }
  assert.ok(settings.includes('title="Connectors"'));
  assert.ok(settings.includes('title="AI Gateway"'));
  assert.ok(!settings.includes('title="Integrations"'));
  assert.ok(settings.includes('title="Memory"'));
  assert.ok(settings.includes('title="Knowledge"'));
  assert.ok(!settings.includes('title="Memory & knowledge"'));
  assert.ok(!settings.includes('to="/api-keys"'));
});

test("Toolkit creation reads from the personal library, not the Marketplace catalog", () => {
  const source = readFileSync(
    path.resolve(process.cwd(), "src/components/toolkit-creator.tsx"),
    "utf8",
  );
  assert.match(source, /listLibraryResources/);
  assert.doesNotMatch(source, /useMarketplace/);
});

test("Open-Connect exposes one HillStreet workspace with project-only creation", () => {
  const sourceRoot = path.resolve(process.cwd(), "src");
  const projects = readFileSync(
    path.join(sourceRoot, "routes/_authenticated/projects.tsx"),
    "utf8",
  );
  const switcher = readFileSync(path.join(sourceRoot, "components/workspace-switcher.tsx"), "utf8");
  const organizationFunctions = readFileSync(
    path.join(sourceRoot, "lib/orgs.functions.ts"),
    "utf8",
  );

  assert.match(projects, /One workspace for every HillStreet project/);
  assert.doesNotMatch(projects, /Create workspace/);
  assert.doesNotMatch(switcher, /Switch workspace|View all workspaces/);
  assert.match(organizationFunctions, /uses one HillStreet workspace/);
  assert.match(organizationFunctions, /\.eq\("slug", "hillstreet"\)/);
});

test("Projects can only select resources from the installed workspace library", () => {
  const sourceRoot = path.resolve(process.cwd(), "src");
  const projectPage = readFileSync(
    path.join(sourceRoot, "routes/_authenticated/projects.$projectId.tsx"),
    "utf8",
  );
  const workspaceFunctions = readFileSync(
    path.join(sourceRoot, "lib/workspace.functions.ts"),
    "utf8",
  );

  assert.match(projectPage, /Shared workspace library/);
  assert.doesNotMatch(projectPage, /Add from marketplace catalog/);
  assert.match(workspaceFunctions, /open-connect-personal-library/);
  assert.match(workspaceFunctions, /Install this resource into your workspace library first/);
  assert.doesNotMatch(workspaceFunctions, /\.eq\("published", true\)/);
});

test("Project deletion is confirmed, privileged, audited, and keeps library resources", () => {
  const sourceRoot = path.resolve(process.cwd(), "src");
  const projectPage = readFileSync(
    path.join(sourceRoot, "routes/_authenticated/projects.$projectId.tsx"),
    "utf8",
  );
  const organizationFunctions = readFileSync(
    path.join(sourceRoot, "lib/orgs.functions.ts"),
    "utf8",
  );

  assert.match(projectPage, /Delete project permanently\?/);
  assert.match(projectPage, /Installed workspace-library resources are\s+not deleted/);
  assert.match(projectPage, /isAdmin/);
  assert.match(organizationFunctions, /requireOrganizationManager/);
  assert.match(organizationFunctions, /projects\.delete/);
  assert.match(organizationFunctions, /control_audit_events/);
});

test("Projects support audited renaming and metadata-only shared credentials", () => {
  const sourceRoot = path.resolve(process.cwd(), "src");
  const projectPage = readFileSync(
    path.join(sourceRoot, "routes/_authenticated/projects.$projectId.tsx"),
    "utf8",
  );
  const organizationFunctions = readFileSync(
    path.join(sourceRoot, "lib/orgs.functions.ts"),
    "utf8",
  );
  const migration = readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20260924040000_project_credential_scopes.sql"),
    "utf8",
  );

  assert.match(projectPage, /Rename project/);
  assert.match(projectPage, /Shared credentials/);
  assert.match(projectPage, /Connections · MCP · AI Gateway/);
  assert.match(organizationFunctions, /projects\.rename/);
  assert.match(migration, /join public\.credential_secrets/);
  assert.doesNotMatch(migration, /vault\.decrypted_secrets|secret_value/);
});

test("Memory and Knowledge stay private, searchable, and project-organized", () => {
  const sourceRoot = path.resolve(process.cwd(), "src");
  const studio = readFileSync(path.join(sourceRoot, "routes/_authenticated/studio.tsx"), "utf8");
  const memoryPage = readFileSync(
    path.join(sourceRoot, "routes/_authenticated/memory.tsx"),
    "utf8",
  );
  const projectPage = readFileSync(
    path.join(sourceRoot, "routes/_authenticated/projects.$projectId.tsx"),
    "utf8",
  );

  assert.match(studio, /publishablePackageTypes/);
  assert.doesNotMatch(
    studio.match(/const publishablePackageTypes = \[([^\]]+)\]/)?.[1] ?? "",
    /memory|knowledge/,
  );
  assert.match(studio, /Memory and Knowledge stay private/);
  assert.match(memoryPage, /Search memory title, content, and tags/);
  assert.match(memoryPage, /projectNames\.get/);
  assert.match(projectPage, /Private context assigned from Studio/);
});

test("installed project resources are grouped into professional categories", () => {
  const groups = groupProjectResources([
    { id: "a", resources: { id: "1", name: "Agent", resource_type: "agent" } },
    { id: "s", resources: { id: "2", name: "Skill", resource_type: "skill" } },
    { id: "m", resources: { id: "3", name: "Memory", resource_type: "memory" } },
    { id: "x", resources: { id: "4", name: "MCP", resource_type: "mcp" } },
  ]);

  assert.deepEqual(
    groups.map((group) => [group.label, group.items.length]),
    [
      ["Agents", 1],
      ["Skills", 1],
      ["MCP Servers", 1],
      ["Memory", 1],
    ],
  );
});

test("resource purposes combine catalog aliases without mixing types or losing uncategorized items", () => {
  const rows = [
    { id: "a", resources: { resource_type: "skill", category_slug: "development" } },
    { id: "b", resources: { resource_type: "plugin", category_slug: "developer" } },
    { id: "c", resources: { resource_type: "skill", category_slug: "business" } },
    { id: "d", resources: { resource_type: "mcp", category_slug: null } },
    { id: "e", resources: null },
    { id: "f", resources: { resource_type: "agent", category_slug: "customer-support" } },
  ];
  assert.deepEqual(
    groupResourcesByPurpose(rows).map(({ label, items }) => [label, items.map((row) => row.id)]),
    [
      ["Business", ["c"]],
      ["Customer Support", ["f"]],
      ["Developer", ["a", "b"]],
      ["General", ["d"]],
    ],
  );
  assert.deepEqual(groupResourcesByPurpose([]), []);
});

test("every sidebar destination uses workspace chrome and matches page search labels", () => {
  const sidebar = readFileSync(
    path.resolve(process.cwd(), "src/components/app-sidebar.tsx"),
    "utf8",
  );
  const items = [...sidebar.matchAll(/to: "([^"\n]+)", label: "([^"\n]+)"/g)].map((match) => ({
    to: match[1]!,
    label: match[2]!,
  }));
  assert.ok(items.length > 10);
  assert.deepEqual(
    items.map((item) => item.to).sort(),
    flatAppNav()
      .map((item) => item.to)
      .sort(),
  );
  for (const item of items) {
    assert.ok(isAppPath(item.to), `${item.to} must not show duplicate public chrome`);
    assert.equal(flatAppNav().find((nav) => nav.to === item.to)?.label, item.label);
  }
  assert.equal(isAppPath("/mcp"), false, "MCP protocol endpoint is not a workspace page");
  assert.equal(isAppPath("/tools-unrelated"), false);
});

test("Discover keeps Marketplace and Resources while resource types stay in the library", () => {
  assert.deepEqual(
    appCategories.find((group) => group.id === "discover")?.items.map((item) => item.label),
    ["Marketplace", "Resources"],
  );
  assert.equal(
    flatAppNav().some((item) => item.to === "/others"),
    false,
  );
});

test("Connections keeps Connectors, Credentials, and AI Gateway", () => {
  assert.deepEqual(
    appCategories.find((group) => group.id === "connections")?.items.map((item) => item.label),
    ["Connectors", "Credentials", "AI Gateway"],
  );
});

test("Marketplace and Resources expose only installable package categories", () => {
  assert.deepEqual(
    resourceCategories.map((category) => category.label),
    ["All", "Skills", "MCP", "Tools", "Plugins", "Agents", "Prompts", "Toolkits", "Others"],
  );

  const groups = groupResourcesByType([
    { id: "s", resources: { resource_type: "skill" } },
    { id: "m", resources: { resource_type: "model" } },
    { id: "x", resources: { resource_type: "custom-integration" } },
  ]);
  assert.deepEqual(
    groups.map((group) => [group.label, group.items.length]),
    [
      ["Skills", 1],
      ["Others", 2],
    ],
  );
});

test("Guides, apps, models, memory, and knowledge are excluded from Marketplace and the library list", () => {
  const marketplace = readFileSync(path.resolve(process.cwd(), "src/routes/resources.tsx"), "utf8");
  const library = readFileSync(
    path.resolve(process.cwd(), "src/components/resource-library-page.tsx"),
    "utf8",
  );

  assert.match(marketplace, /\["guide", "app", "model", "memory", "knowledge"\]/);
  assert.match(library, /\["guide", "app", "model", "memory", "knowledge"\]/);
  for (const type of ["guide", "app", "model", "memory", "knowledge"]) {
    assert.equal(
      resourceCategories.some((category) => category.value === type),
      false,
    );
  }
});

test("Resources provides Library, Collections, Memory, and Knowledge views", () => {
  const source = readFileSync(
    path.resolve(process.cwd(), "src/components/resource-library-page.tsx"),
    "utf8",
  );

  assert.match(source, /\["library", "collections", "memory", "knowledge"\]/);
  assert.match(source, /view === "memory"/);
  assert.match(source, /view === "knowledge"/);
  assert.match(source, /resourceCategories\.map\(\(filter\) =>/);
  assert.match(source, /aria-label="Filter resources by category"/);
  assert.match(source, /aria-pressed=\{category === filter\.value\}/);
  assert.match(source, /rounded-full border px-3 py-1\.5 text-xs transition-colors/);
  assert.doesNotMatch(source, /<select[\s\S]*?aria-label="Resource category"/);
});

test("selected library resources can be added while creating a collection", () => {
  const sourceRoot = path.resolve(process.cwd(), "src");
  const panel = readFileSync(
    path.join(sourceRoot, "components/resource-collections-panel.tsx"),
    "utf8",
  );
  const functions = readFileSync(
    path.join(sourceRoot, "lib/resource-collections.functions.ts"),
    "utf8",
  );

  assert.match(panel, /resourceIds: selectedResourceIds/);
  assert.match(panel, /will be added to this collection/);
  assert.match(panel, /Create & add/);
  assert.ok(functions.includes("data.resourceIds.map"));
  assert.match(functions, /const newIds/);
});

test("Marketplace skill installs automatically join the Skills collection", () => {
  const sourceRoot = path.resolve(process.cwd(), "src");
  const library = readFileSync(path.join(sourceRoot, "lib/library.functions.ts"), "utf8");
  const marketplace = readFileSync(path.join(sourceRoot, "routes/resources.tsx"), "utf8");
  const button = readFileSync(path.join(sourceRoot, "components/add-to-library.tsx"), "utf8");
  const install = library.slice(
    library.indexOf("export const addResourceToLibrary"),
    library.indexOf("export const removeResourceFromLibrary"),
  );

  assert.match(library, /async function ensureSkillsCollection/);
  assert.match(library, /name: "Skills"/);
  assert.match(library, /installedSkills\.map/);
  assert.match(install, /resource\.resource_type === "skill"/);
  assert.match(install, /collectionId = await ensureSkillsCollection\(context\)/);
  assert.match(marketplace, /Skills are automatically added to your Library and Skills collection/);
  assert.match(button, /Added to your Library and Skills collection/);
});

test("Marketplace installs stay in the personal library and agent context reads are user scoped", () => {
  const sourceRoot = path.resolve(process.cwd(), "src");
  const library = readFileSync(path.join(sourceRoot, "lib/library.functions.ts"), "utf8");
  const mcp = readFileSync(path.join(sourceRoot, "routes/mcp.ts"), "utf8");
  const scopes = readFileSync(path.join(sourceRoot, "lib/access-profiles.ts"), "utf8");
  const install = library.slice(
    library.indexOf("export const addResourceToLibrary"),
    library.indexOf("export const removeResourceFromLibrary"),
  );

  assert.match(library, /LIBRARY_SLUG = "open-connect-personal-library"/);
  assert.match(install, /toolkit_items/);
  assert.doesNotMatch(install, /project_resources/);
  assert.match(mcp, /name === "list_my_memory"/);
  assert.match(mcp, /name === "list_my_knowledge"/);
  assert.match(mcp, /key.userId/);
  assert.match(mcp, /resolveUserUpstreams/);
  assert.match(scopes, /"memory:read"/);
  assert.match(scopes, /"knowledge:read"/);
});
