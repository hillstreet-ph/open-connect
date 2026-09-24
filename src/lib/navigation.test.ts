import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { appCategories, flatAppNav, flatPublicNav, publicCategories } from "./nav.ts";
import { groupProjectResources } from "./resource-categories.ts";

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
  const connectGroup = sidebar.match(/const CONNECT: Item\[\] = \[([\s\S]*?)\];/)?.[1] ?? "";

  for (const route of ["/connections", "/integrations", "/secrets", "/models"]) {
    assert.match(connectGroup, new RegExp(`to: ["']${route}["']`));
  }
  assert.doesNotMatch(connectGroup, /\/resources/);

  for (const routeFile of ["connections.tsx", "integrations.tsx", "models.tsx"]) {
    const source = readFileSync(path.join(sourceRoot, "routes", routeFile), "utf8");
    assert.doesNotMatch(source, /(?:to|href)=["']\/resources["']/);
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

  assert.match(projectPage, /Add from workspace library/);
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
      ["Memory", 1],
      ["Other", 1],
    ],
  );
});
