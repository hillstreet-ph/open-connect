import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  canonicalizeUrl,
  deduplicateCandidates,
  normalizeOpenSlug,
  registryFingerprint,
} from "./registry-normalize.ts";

test("normalizes repository URLs and open-prefixed slugs", () => {
  assert.equal(
    canonicalizeUrl("https://GitHub.com/Open-WebUI/Open-WebUI.git/"),
    "https://github.com/Open-WebUI/Open-WebUI",
  );
  assert.equal(normalizeOpenSlug("Open WebUI Tools"), "open-webui-tools");
  assert.equal(normalizeOpenSlug("open-connect"), "open-connect");
});

test("deduplicates canonical URLs and keeps the newest metadata", () => {
  const rows = deduplicateCandidates([
    {
      sourceId: "one",
      externalId: "1",
      name: "Old",
      canonicalUrl: "https://github.com/a/b.git",
      updatedAt: "2026-01-01",
    },
    {
      sourceId: "two",
      externalId: "2",
      name: "New",
      canonicalUrl: "https://github.com/a/b/",
      updatedAt: "2026-02-01",
    },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.name, "New");
  assert.equal(registryFingerprint(rows[0]!), registryFingerprint(rows[0]!));
});

test("agent team has one supervisor, open names, and no direct self delegation", () => {
  const registry = JSON.parse(readFileSync("config/open-agent-team.registry.json", "utf8")) as {
    supervisor: string;
    agents: Array<{ id: string; role: string; delegates: string[] }>;
  };
  assert.equal(registry.agents.filter((agent) => agent.role === "supervisor").length, 1);
  assert.ok(registry.agents.every((agent) => agent.id.startsWith("open-")));
  assert.ok(registry.agents.every((agent) => !agent.delegates.includes(agent.id)));
  assert.ok(registry.agents.some((agent) => agent.id === registry.supervisor));
});
