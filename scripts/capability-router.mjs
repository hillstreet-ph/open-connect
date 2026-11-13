#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const registry = JSON.parse(
  readFileSync(resolve(root, "credentials/capability-registry.json"), "utf8"),
);

export function recommendCapabilities(input) {
  const query = input.toLowerCase();
  return registry.capabilities
    .map((capability) => ({
      ...capability,
      score: capability.keywords.filter((keyword) => query.includes(keyword)).length,
    }))
    .filter((capability) => capability.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .map(({ id, profile, commands, score }) => ({ id, profile, commands, score }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const query = process.argv.slice(2).join(" ").trim();
  if (!query) {
    console.error("Usage: capability-router.mjs <task description>");
    process.exitCode = 2;
  } else {
    console.log(JSON.stringify({ query, recommendations: recommendCapabilities(query) }, null, 2));
  }
}
