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
  const connectGroup = sidebar.match(/const CONNECTIONS: Item\[\] = \[([\s\S]*?)\];/)?.[1] ?? "";

  for (const route of ["/connections", "/secrets", "/models"]) {
    assert.match(connectGroup, new RegExp(`to: ["']${route}["']`));
  }
  assert.match(sidebar, /<NavGroup label="Connections" items={CONNECTIONS}/);
  assert.match(connectGroup, /to: "\/connections", label: "Connectors"/);
  assert.doesNotMatch(connectGroup, /\/resources|\/integrations|\/api-keys/);
  assert.match(userMenu, /to="\/integrations"/);
  assert.match(userMenu, /to="\/api-keys"/);

  const models = readFileSync(path.join(sourceRoot, "routes/_authenticated/models.tsx"), "utf8");
  assert.match(models, /createFileRoute\("\/_authenticated\/models"\)/);
  assert.doesNotMatch(models, /(?:to|href)=["']\/(?:resources|auth)["']/);

  const connectors = readFileSync(
    path.join(sourceRoot, "routes/_authenticated/connections.tsx"),
    "utf8",
  );
  assert.match(connectors, /createFileRoute\("\/_authenticated\/connections"\)/);
  assert.match(connectors, /Add custom MCP/);
  assert.doesNotMatch(connectors, /(?:to|href)=["']\/resources["']/);

  const integrations = readFileSync(
    path.join(sourceRoot, "routes/_authenticated/integrations.tsx"),
    "utf8",
  );
  assert.match(integrations, /createFileRoute\("\/_authenticated\/integrations"\)/);
  assert.doesNotMatch(integrations, /(?:to|href)=["']\/resources["']/);
});

test("AI control integrations and API keys only appear in the avatar menu", () => {
  const sourceRoot = path.resolve(process.cwd(), "src");
  const duplicateSurfaces = [
    "components/app-sidebar.tsx",
    "components/site-footer.tsx",
    "routes/_authenticated/projects.$projectId.tsx",
    "routes/_authenticated/settings.tsx",
  ];

  for (const sourceFile of duplicateSurfaces) {
    const source = readFileSync(path.join(sourceRoot, sourceFile), "utf8");
    assert.doesNotMatch(source, /(?:to|href)=["']\/(?:integrations|api-keys)["']/);
  }
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
  assert.ok(items.length > 20);
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

test("Discover order includes dedicated MCP and Tools routes", () => {
  assert.deepEqual(
    appCategories.find((group) => group.id === "discover")?.items.map((item) => item.label),
    [
      "Marketplace",
      "Resources",
      "Agents",
      "Skills",
      "MCP",
      "Tools",
      "Toolkits",
      "Prompts",
      "Memory",
      "Knowledge",
      "Others",
    ],
  );
});

test("Connections order includes Plugins, Connectors, Credentials, and AI Gateway", () => {
  assert.deepEqual(
    appCategories.find((group) => group.id === "connections")?.items.map((item) => item.label),
    ["Plugins", "Connectors", "Credentials", "AI Gateway"],
  );
});

test("Marketplace and Resources share ordered type categories ending with Others", () => {
  assert.deepEqual(
    resourceCategories.map((category) => category.label),
    [
      "All",
      "Skills",
      "MCP",
      "Tools",
      "Plugins",
      "Agents",
      "Prompts",
      "Toolkits",
      "Memory",
      "Knowledge",
      "Apps",
      "Models",
      "Others",
    ],
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
      ["Models", 1],
      ["Others", 1],
    ],
  );
});

test("Guides are excluded from Marketplace and Resources", () => {
  const marketplace = readFileSync(path.resolve(process.cwd(), "src/routes/resources.tsx"), "utf8");
  const library = readFileSync(
    path.resolve(process.cwd(), "src/components/resource-library-page.tsx"),
    "utf8",
  );

  assert.match(marketplace, /item\.resource_type !== "guide"/);
  assert.match(library, /row\.resources\?\.resource_type !== "guide"/);
  assert.equal(
    resourceCategories.some((category) => category.value === "guide"),
    false,
  );
});

test("Resources uses the Marketplace category chip controls", () => {
  const source = readFileSync(
    path.resolve(process.cwd(), "src/components/resource-library-page.tsx"),
    "utf8",
  );

  assert.match(source, /resourceCategories\.map\(\(filter\) =>/);
  assert.match(source, /aria-label="Filter resources by category"/);
  assert.match(source, /aria-pressed=\{category === filter\.value\}/);
  assert.match(source, /rounded-full border px-3 py-1\.5 text-xs transition-colors/);
  assert.doesNotMatch(source, /<select[\s\S]*?aria-label="Resource category"/);
});
