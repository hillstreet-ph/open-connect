import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mcpRoute = readFileSync(new URL("../routes/mcp.ts", import.meta.url), "utf8");
const operations = readFileSync(new URL("./ops.functions.ts", import.meta.url), "utf8");
const migration = readFileSync(
  new URL("../../supabase/migrations/20260918130000_autonomous_learning.sql", import.meta.url),
  "utf8",
);

test("publishes capability discovery, draft creation, and outcome tools", () => {
  for (const tool of [
    "recommend_toolchain",
    "resolve_capability",
    "create_capability_draft",
    "record_run_outcome",
  ]) {
    assert.match(mcpRoute, new RegExp(`name: ["']${tool}["']`));
  }
});

test("keeps missing capability creation non-executable", () => {
  assert.match(mcpRoute, /executable: false/);
  assert.match(migration, /'tinyfish-agent-browser'/);
  assert.match(migration, /"credential_ref":"credential:\/\/tinyfish\/browser-agent"/);
});

test("persists redacted learning events and memory", () => {
  assert.match(mcpRoute, /buildLearningRecord/);
  assert.match(mcpRoute, /from\(["']autonomous_run_events["']\)/);
  assert.match(mcpRoute, /from\(["']memory_records["']\)/);
  assert.match(mcpRoute, /from\(["']knowledge_items["']\)/);
});

test("dispatches agent automations into governed autonomous runs", () => {
  assert.match(operations, /automation\.action_type === ["']agent["']/);
  assert.match(operations, /buildAdaptivePlan/);
  assert.match(operations, /from\(["']autonomous_runs["']\)/);
  assert.match(operations, /correlation_id/);
});
