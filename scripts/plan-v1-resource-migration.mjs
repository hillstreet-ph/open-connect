#!/usr/bin/env node
// Read-only migration planner. Does not write to the database or publish resources.
import { readFile } from "node:fs/promises";
import { basename } from "node:path";

const [inventoryPath, catalogPath] = process.argv.slice(2);
if (!inventoryPath || !catalogPath) {
  throw new Error(
    "Usage: node scripts/plan-v1-resource-migration.mjs inventory.json current-catalog.json",
  );
}
const inventory = JSON.parse(await readFile(inventoryPath, "utf8"));
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
if (!Array.isArray(inventory.entries)) throw new Error("Invalid inventory entries");
const current = Array.isArray(catalog) ? catalog : (catalog.data ?? catalog.resources);
if (!Array.isArray(current)) throw new Error("Invalid current catalog");
const canonical = (value) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const bySlug = new Map();
for (const item of current) {
  for (const value of [item.slug, item.name]) {
    const key = canonical(value);
    if (key) bySlug.set(key, item);
  }
}
const groups = new Map();
for (const entry of inventory.entries) {
  if (typeof entry.path !== "string" || !entry.path.startsWith(".skills/")) continue;
  const segments = entry.path.split("/");
  if (segments.length < 3) continue;
  const name = segments[1];
  if (!groups.has(name)) groups.set(name, []);
  groups.get(name).push(entry);
}
const candidates = [...groups].map(([name, files]) => {
  const key = canonical(name);
  const existing = bySlug.get(key);
  const hasSkill = files.some((file) => basename(file.path).toLowerCase() === "skill.md");
  return {
    name,
    proposed_slug: key,
    file_count: files.length,
    has_skill_md: hasSkill,
    existing_slug: existing?.slug ?? null,
    decision: existing ? "manual_merge_review" : hasSkill ? "draft_candidate" : "incomplete_source",
    verified: false,
    published: false,
    requires_license_review: true,
    requires_security_review: true,
  };
});
candidates.sort((a, b) => a.name.localeCompare(b.name));
const summary = {
  source: "v1-open-connect",
  destination: "open-connect",
  candidate_folders: candidates.length,
  existing_matches: candidates.filter((x) => x.existing_slug).length,
  draft_candidates: candidates.filter((x) => x.decision === "draft_candidate").length,
  incomplete: candidates.filter((x) => x.decision === "incomplete_source").length,
  database_writes: 0,
  published: 0,
  candidates,
};
process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
