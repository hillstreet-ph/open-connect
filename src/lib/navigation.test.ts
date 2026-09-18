import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
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
