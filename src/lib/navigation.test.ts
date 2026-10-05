import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
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
  assert.ok(!userMenu.includes('to="/integrations"'));

  const connectors = readFileSync(
    path.join(sourceRoot, "routes/_authenticated/connections.tsx"),
    "utf8",
  );
  assert.ok(!connectors.includes("Add custom MCP"));
  assert.ok(connectors.includes("custom_mcp"));
  assert.ok(connectors.includes("MCP endpoint URL"));
  assert.ok(!connectors.includes('to="/resources"'));

  const integrations = readFileSync(
    path.join(sourceRoot, "routes/_authenticated/integrations.tsx"),
    "utf8",
  );
  assert.ok(integrations.includes("<ApiKeysCard />"));
  assert.ok(integrations.includes("Connect ChatGPT with OAuth"));
  assert.ok(integrations.includes("setTelegramOpen(true)"));
  assert.ok(integrations.includes("inbound-integrations.functions"));
  assert.ok(integrations.includes("connections.functions"));
  assert.ok(integrations.includes("Remote MCP servers"));
  for (const section of ['id="api-key"', 'id="apps"', 'id="ai-agents"', 'id="custom-mcp"']) {
    assert.ok(integrations.includes(section), "Missing integration section " + section);
  }

  const inboundMigration = readFileSync(
    path.resolve(process.cwd(), "supabase/migrations/20261005050000_inbound_integrations.sql"),
    "utf8",
  );
  assert.ok(inboundMigration.includes("CREATE TABLE IF NOT EXISTS public.inbound_integrations"));
  assert.ok(inboundMigration.includes("Users manage own inbound integrations"));
  assert.ok(!inboundMigration.includes("REFERENCES public.app_connections"));
  for (const route of ["/resources", "/connections", "/mcp-servers", "/api-keys"]) {
    assert.ok(!integrations.includes('to="' + route + '"'), "Unexpected redirect to " + route);
  }
});

test("Integrations follows Data & privacy in Settings and includes account keys", () => {
  const sourceRoot = path.resolve(process.cwd(), "src");
  const userMenu = readFileSync(path.join(sourceRoot, "components/user-menu.tsx"), "utf8");
  const settings = readFileSync(
    path.join(sourceRoot, "routes/_authenticated/settings.tsx"),
    "utf8",
  );

  assert.ok(userMenu.includes('to="/settings"'));
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
    to: match[1],
    label: match[2],
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
