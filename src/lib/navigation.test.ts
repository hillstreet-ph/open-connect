import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { adminTab, settingsTab, settingsTabList } from "./settings-navigation.ts";
import { isAppPath } from "./shell.ts";
import {
  appCategories,
  flatAppNav,
  flatPublicNav,
  publicCategories,
  resourceCategories,
} from "./nav.ts";
import {
  groupProjectResources,
  groupResourcesByPurpose,
  groupResourcesByType,
} from "./resource-categories.ts";

function routePaths() {
  const routesRoot = path.resolve(process.cwd(), "src/routes");
  const files = [
    ...readdirSync(routesRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name),
    ...readdirSync(path.join(routesRoot, "_authenticated"), { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name),
  ];

  return new Set(
    files
      .filter((file) => /\.(ts|tsx)$/.test(file) && !["__root.tsx", "route.tsx"].includes(file))
      .map((file) => file.replace(/\.(ts|tsx)$/, ""))
      .filter((file) => !file.includes("$") && file !== "README")
      .map((file) => (file === "index" ? "/" : `/${file}`)),
  );
}

test("all navigation entries resolve to application routes", () => {
  const routes = routePaths();
  const links = [
    ...publicCategories.flatMap((category) => category.items),
    ...appCategories.flatMap((category) => category.items),
    ...flatPublicNav(),
    ...flatAppNav(),
  ];

  for (const link of links) {
    assert.ok(routes.has(link.to), `${link.label} points to missing route ${link.to}`);
  }
});

test("category navigation has no duplicate destinations", () => {
  for (const categories of [publicCategories, appCategories]) {
    const destinations = categories.flatMap((category) => category.items.map((item) => item.to));
    assert.equal(new Set(destinations).size, destinations.length);
  }
});

test("Dashboard links to the canonical Studio uploader without duplicating it", () => {
  const source = readFileSync(
    path.resolve(process.cwd(), "src/routes/_authenticated/dashboard.tsx"),
    "utf8",
  );

  assert.match(source, /to: "\/studio"/);
  assert.doesNotMatch(source, /ResourceLibraryCard|Upload packages/);
});

test("connection surfaces remain internal and separate from Marketplace", () => {
  const sourceRoot = path.resolve(process.cwd(), "src");
  const sidebar = readFileSync(path.join(sourceRoot, "components/app-sidebar.tsx"), "utf8");
  const userMenu = readFileSync(path.join(sourceRoot, "components/user-menu.tsx"), "utf8");

  for (const route of ["/connections", "/secrets", "/models"]) {
    assert.ok(sidebar.includes(route), "Missing connection route " + route);
  }
  assert.ok(sidebar.includes('to: "/connections", label: "Connectors"'));
  assert.ok(userMenu.includes('to="/integrations"'));

  const connectors = readFileSync(
    path.join(sourceRoot, "routes/_authenticated/connections.tsx"),
    "utf8",
  );
  assert.ok(connectors.includes("Add custom MCP"));
  assert.ok(connectors.includes("custom_mcp"));
  assert.ok(connectors.includes("MCP endpoint URL"));
  assert.ok(!connectors.includes('to="/resources"'));

  const integrations = readFileSync(
    path.join(sourceRoot, "routes/_authenticated/integrations.tsx"),
    "utf8",
  );
  assert.ok(integrations.includes("<ApiKeysCard />"));
  assert.ok(integrations.includes("setTelegramOpen(true)"));
  assert.ok(integrations.includes("inbound-integrations.functions"));
  assert.ok(integrations.includes("universal-connector-dialog"));
  assert.ok(integrations.includes("Remote MCP servers"));
  for (const section of ['id="api-key"', 'id="apps"', 'id="custom-mcp"']) {
    assert.ok(integrations.includes(section), "Missing integration section " + section);
  }
  assert.ok(!integrations.includes("ai-agents"), "AI Agents section should stay removed");

  const inboundMigration = readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20261005050000_inbound_integrations.sql"),
    "utf8",
  );
  assert.ok(inboundMigration.includes("CREATE TABLE IF NOT EXISTS public.inbound_integrations"));
  assert.ok(inboundMigration.includes("Users manage own inbound integrations"));
  assert.ok(!inboundMigration.includes("REFERENCES public.app_connections"));
  for (const route of ["/resources", "/mcp-servers", "/api-keys"]) {
    assert.ok(!integrations.includes('to="' + route + '"'), "Unexpected redirect to " + route);
  }
});

test("Settings keeps only personal tabs and duplicates no sidebar destinations", () => {
  const sourceRoot = path.resolve(process.cwd(), "src");
  const userMenu = readFileSync(path.join(sourceRoot, "components/user-menu.tsx"), "utf8");
  const settings = readFileSync(
    path.join(sourceRoot, "routes/_authenticated/settings.tsx"),
    "utf8",
  );

  assert.ok(userMenu.includes('to="/settings"'));
  assert.ok(userMenu.includes('to="/integrations"'));
  assert.ok(userMenu.includes('search={{ section: "api-key" }}'));
  assert.ok(userMenu.includes("Developer"));
  assert.ok(!userMenu.includes('to="/api-keys"'));

  // Settings keeps personal tabs only, in this order.
  assert.deepEqual(settingsTabList(), ["profile", "security", "data", "integrations"]);
  assert.ok(
    settings.indexOf('value="data">Data Controls') <
      settings.indexOf('value="integrations">Integrations'),
  );

  // Every destination that already has a sidebar entry must not be repeated as a Settings card.
  for (const route of [
    "/projects",
    "/models",
    "/connections",
    "/secrets",
    "/automations",
    "/memory",
    "/knowledge",
  ]) {
    assert.ok(!settings.includes(`to="${route}"`), "Settings duplicates sidebar route " + route);
  }
  for (const title of [
    "Projects & environments",
    "AI Gateway",
    "Connectors",
    "Credentials & secrets",
    "Memory",
    "Knowledge",
  ]) {
    assert.ok(!settings.includes(`title="${title}"`), "Settings repeats card " + title);
  }

  // Only the two account-owned integration deep links remain.
  for (const section of ["apps", "custom-mcp"]) {
    assert.ok(settings.includes('href="/integrations?section=' + section + '"'));
  }
  assert.ok(!settings.includes('href="/integrations?section=api-key"'));
  assert.ok(!settings.includes('href="/integrations?section=ai-agents"'));
  assert.ok(!settings.includes('to="/api-keys"'));

  // Approval surfaces are removed everywhere.
  assert.ok(!settings.includes("ControlApprovalsPanel"));
  assert.ok(!settings.includes('value="approvals"'));
  assert.ok(!settings.includes("Approval requests"));

  // Login activity lives in the personal security tab, with per-session sign out.
  assert.ok(settings.includes("LoginActivityPanel"));
  assert.ok(settings.indexOf('value="security"') < settings.indexOf("<LoginActivityPanel />"));

  const panel = readFileSync(path.join(sourceRoot, "components/login-activity-panel.tsx"), "utf8");
  // The cache must be keyed to the account so a switch in another tab cannot show stale rows.
  assert.ok(panel.includes('queryKey: ["login-activity", userId]'));
  assert.ok(panel.includes("key={user.id}"));
});

test("Workspace header keeps a single account entry point and a persistent sidebar toggle", () => {
  const sourceRoot = path.resolve(process.cwd(), "src");
  const shell = readFileSync(path.join(sourceRoot, "components/workspace-shell.tsx"), "utf8");
  const sidebar = readFileSync(path.join(sourceRoot, "components/ui/sidebar.tsx"), "utf8");

  // The account menu owns Settings and administration; the header must not duplicate them.
  assert.ok(!shell.includes('to="/settings"'), "Header must not repeat the Settings link");
  assert.ok(!shell.includes("Open your account settings"));
  assert.ok(shell.includes("sidebarDefaultOpen"), "Sidebar toggle state must be restored");
  assert.ok(sidebar.includes("writeSidebarOpen"));
  const sidebarState = readFileSync(path.join(sourceRoot, "lib/sidebar-state.ts"), "utf8");
  assert.ok(sidebarState.includes("export function sidebarDefaultOpen"));
  assert.ok(sidebarState.includes("SIDEBAR_COOKIE_NAME"));
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

test("Connections keeps Connectors, Credentials, AI Gateway, and AI Agency", () => {
  assert.deepEqual(
    appCategories.find((group) => group.id === "connections")?.items.map((item) => item.label),
    ["Connectors", "Credentials", "AI Gateway", "AI Agency"],
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

test("Approval surfaces are removed from the sidebar, navigation, and shell", () => {
  const sourceRoot = path.resolve(process.cwd(), "src");
  const sidebar = readFileSync(path.join(sourceRoot, "components/app-sidebar.tsx"), "utf8");
  const shell = readFileSync(path.join(sourceRoot, "components/workspace-shell.tsx"), "utf8");

  assert.ok(!sidebar.includes("/approvals"), "Sidebar must not link to Approvals");
  assert.ok(!sidebar.includes("ShieldCheck"), "Sidebar must drop the Approvals icon");
  assert.ok(
    !flatAppNav().some((item) => item.to === "/approvals"),
    "App navigation must not expose Approvals",
  );
  assert.ok(!shell.includes("approvals"), "Workspace header must not link to Approvals");
  assert.ok(!settingsTabList().includes("approvals"));

  const removed = [
    "routes/_authenticated/approvals.tsx",
    "components/control-approvals-panel.tsx",
    "lib/control-approvals.functions.ts",
  ];
  for (const file of removed) {
    assert.throws(() => readFileSync(path.join(sourceRoot, file), "utf8"), /ENOENT/, file);
  }
});

test("System administration keeps one entry point with organization and access tabs", () => {
  const sourceRoot = path.resolve(process.cwd(), "src");
  const userMenu = readFileSync(path.join(sourceRoot, "components/user-menu.tsx"), "utf8");
  const settings = readFileSync(
    path.join(sourceRoot, "routes/_authenticated/settings.tsx"),
    "utf8",
  );
  const admin = readFileSync(path.join(sourceRoot, "routes/_authenticated/admin.tsx"), "utf8");
  const orgs = readFileSync(path.join(sourceRoot, "routes/_authenticated/orgs.tsx"), "utf8");
  const roles = readFileSync(path.join(sourceRoot, "routes/_authenticated/roles.tsx"), "utf8");

  assert.ok(userMenu.includes('to="/admin"'), "hillstreet-ph opens System administration");
  assert.ok(userMenu.includes("hillstreet-ph"));
  assert.ok(!userMenu.includes('to="/orgs"'));

  assert.ok(admin.includes('value="organization"'));
  assert.ok(admin.includes('value="access"'));
  assert.ok(admin.includes("OrganizationPanel"));
  assert.ok(admin.includes("AccessReferencePanel"));
  // Platform roles are managed inside the Organization people list, not a separate tab.
  assert.ok(!admin.includes('value="roles"'));
  assert.ok(!admin.includes("PlatformRolesPanel"));
  assert.ok(!admin.includes("platform-roles-panel"));

  // Both legacy URLs land on the merged organization surface.
  assert.ok(orgs.includes('to: "/admin"') && orgs.includes('hash: "organization"'));
  assert.ok(roles.includes('to: "/admin"') && roles.includes('hash: "organization"'));

  // Settings must not repeat the administration links; the account menu owns that entry.
  assert.ok(!settings.includes('to="/orgs"'));
  assert.ok(!settings.includes('to="/roles"'));
  assert.ok(!settings.includes('to="/admin"'));
  assert.ok(!settings.includes('title="Access reference"'));
  assert.ok(!settings.includes('title="User roles"'));
});

test("Organization panel owns people and roles in one place", () => {
  const panel = readFileSync(
    path.resolve(process.cwd(), "src/components/organization-panel.tsx"),
    "utf8",
  );
  // One people list carries the organization role, platform role, and group controls.
  assert.ok(panel.includes("Organization role"));
  assert.ok(panel.includes("Platform role"));
  assert.ok(panel.includes("roleLabel"));
  assert.ok(panel.includes("assignRole"));
  // Legacy platform values (owner/publisher) collapse onto assignable roles for the select.
  assert.ok(panel.includes("canonicalAppRole"));
  // Pending invitations can be cancelled with confirmation.
  assert.ok(panel.includes("cancelOrganizationInvitation"));
  assert.ok(panel.includes("Cancel invitation"));
  // No second "assign by email" form duplicating the invite flow.
  assert.ok(!panel.includes("Assign role"));
});

test("cancelling an invitation revokes only pending rows for organization managers", () => {
  const fn = readFileSync(path.resolve(process.cwd(), "src/lib/orgs.functions.ts"), "utf8");
  assert.ok(fn.includes("export const cancelOrganizationInvitation"));
  assert.ok(fn.includes('status: "revoked"'));
  assert.ok(fn.includes("requireOrganizationManager"));
  assert.ok(fn.includes('if (invitation.status !== "pending")'));
});

test("Access reference has one canonical rendering of each role fact", () => {
  const sourceRoot = path.resolve(process.cwd(), "src");
  const panel = readFileSync(
    path.join(sourceRoot, "components/access-reference-panel.tsx"),
    "utf8",
  );
  const rbac = readFileSync(path.join(sourceRoot, "lib/rbac.ts"), "utf8");
  const identity = readFileSync(path.join(sourceRoot, "lib/identity.ts"), "utf8");

  // The panel derives role facts from shared sources instead of re-declaring them.
  assert.ok(panel.includes("CAPABILITY_DOCS"));
  assert.ok(panel.includes("capabilityLevel"));
  assert.ok(panel.includes("PLATFORM_ROLE_SUMMARY"));
  assert.ok(panel.includes("ORG_ROLE_SUMMARY"));
  assert.ok(panel.includes("PROJECT_ROLE_SUMMARY"));
  assert.ok(panel.includes("AVAILABLE_KEY_SCOPES"));
  assert.ok(panel.includes("scopeCapability"));
  assert.ok(!panel.includes("ROLE_SCOPE_MATRIX"));
  assert.ok(!panel.includes("KEY_SCOPE_DOCS"));

  // Role labels are defined once per vocabulary and reused across the app.
  assert.ok(rbac.includes("export const PLATFORM_ROLE_SUMMARY"));
  assert.ok(identity.includes("export const ORG_ROLES"));
  assert.ok(identity.includes("export const PROJECT_ROLES"));

  // The old duplicate matrix/scope lists are gone from the canonical libs.
  assert.ok(!rbac.includes("ROLE_SCOPE_MATRIX"));
  assert.ok(!rbac.includes("KEY_SCOPE_DOCS"));
});

test("System administration tabs fall back safely for unknown values", () => {
  for (const tab of ["organization", "access"]) {
    assert.equal(adminTab(tab), tab);
    assert.equal(adminTab("#" + tab), tab);
  }
  // Legacy "#roles" deep links fold into the merged organization surface.
  assert.equal(adminTab("roles"), "organization");
  assert.equal(adminTab("#roles"), "organization");
  for (const value of ["", "missing", "#organization/other", "__proto__"]) {
    assert.equal(adminTab(value), "organization");
  }
});

test("settings deep links select their exact tab and unknown hashes have a safe default", () => {
  for (const tab of settingsTabList()) {
    assert.equal(settingsTab(tab), tab);
    assert.equal(settingsTab("#" + tab), tab);
  }
  for (const hash of ["", "missing", "#workspace", "#apps", "#approvals/other", "__proto__"])
    assert.equal(settingsTab(hash), "profile");
});

test("every authenticated route owns workspace chrome, including callback and project access pages", async () => {
  const { usesWorkspaceChrome } = await import("./shell.ts");
  const files = readdirSync(path.resolve("src/routes/_authenticated")).filter(
    (file) => /\.tsx?$/.test(file) && file !== "route.tsx",
  );
  for (const file of files) {
    const route =
      "/" +
      file
        .replace(/\.tsx?$/, "")
        .replaceAll(".", "/")
        .replace(/\$[^/]+/g, "fixture");
    assert.ok(isAppPath(route), route + " must not render public and workspace headers together");
    assert.equal(usesWorkspaceChrome(route, false, true), true);
  }
  assert.equal(usesWorkspaceChrome("/", true, false), false);
  assert.equal(usesWorkspaceChrome("/resources", false, false), false);
});
test("back navigation uses parents, clears section routes and stays absent on main destinations", async () => {
  const { workspaceBackTarget, publicBackTarget } = await import("./back-navigation.ts");
  for (const route of flatAppNav())
    assert.equal(workspaceBackTarget(route.to), null, route.to + " has sidebar navigation");
  assert.equal(publicBackTarget("/"), null);
  assert.equal(publicBackTarget("/dashboard/"), null);
  assert.deepEqual(workspaceBackTarget("/integrations/"), {
    to: "/settings",
    hash: "integrations",
    label: "Back to settings",
  });
  assert.equal(workspaceBackTarget("/settings", "data")?.to, "/settings");
  assert.equal(workspaceBackTarget("/settings")?.to, "/dashboard");
  assert.equal(workspaceBackTarget("/projects/fixture")?.to, "/projects");
  const project = "11111111-1111-4111-8111-111111111111";
  assert.deepEqual(workspaceBackTarget("/project-access/" + project), {
    to: "/projects/$projectId",
    params: { projectId: project },
    label: "Back to project",
  });
  assert.equal(workspaceBackTarget("/project-access/not-a-project")?.to, "/projects");
  assert.equal(workspaceBackTarget("/custom-oauth-callback"), null);
});
test("public homepage removes Marketplace header navigation while preserving workspace access", () => {
  assert.deepEqual(flatPublicNav("/"), []);
  assert.deepEqual(flatPublicNav("///"), []);
  assert.ok(flatPublicNav("/resources").some((item) => item.to === "/resources"));
  assert.ok(flatAppNav().some((item) => item.to === "/resources"));
  const project = readFileSync(
    path.resolve("src/routes/_authenticated/projects.$projectId.tsx"),
    "utf8",
  );
  assert.ok(!project.includes("Back to projects"));
});

test("cloud computer is available from the single browser workspace", () => {
  const cloud = appCategories.find((category) => category.id === "cloud");
  assert.ok(cloud?.items.some((item) => item.to === "/cloud-browser"));
  assert.ok(!cloud?.items.some((item) => item.to === "/cloud-computer"));
  const oldRoute = readFileSync(
    path.resolve(process.cwd(), "src/routes/_authenticated/cloud-computer.tsx"),
    "utf8",
  );
  assert.match(oldRoute, /redirect\(\{ to: "\/cloud-browser", search: \{ mode: "computer" \}/);
});
