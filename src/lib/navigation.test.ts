import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { appCategories, flatAppNav, flatPublicNav, publicCategories } from "./nav.ts";

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
    path.resolve(process.cwd(), "src/routes/_authenticated/toolkits.tsx"),
    "utf8",
  );
  assert.match(source, /listLibraryResources/);
  assert.doesNotMatch(source, /useMarketplace/);
});
