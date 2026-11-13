import test from "node:test";
import assert from "node:assert/strict";
import {
  AI_GATEWAY_ALIASES,
  ALIAS_GROUPS,
  MODEL_ALIASES,
  SPECIAL_ALIASES,
  aliasTarget,
} from "./model-aliases.ts";

test("every alias maps to a non-empty target", () => {
  for (const [alias, target] of Object.entries(MODEL_ALIASES)) {
    assert.ok(target.length > 0, "empty target for " + alias);
  }
});

test("alias groups cover every non-identity alias and list no unknown alias", () => {
  const grouped = new Set(ALIAS_GROUPS.flatMap((group) => group.items.map((item) => item.alias)));
  for (const [alias, target] of Object.entries(MODEL_ALIASES)) {
    if (alias === target) continue;
    assert.ok(grouped.has(alias), "missing from groups: " + alias);
  }
  for (const alias of grouped) {
    assert.ok(
      alias in MODEL_ALIASES || alias in SPECIAL_ALIASES,
      "unknown alias in groups: " + alias,
    );
  }
});

test("public discovery aliases are unique and resolve to real targets", () => {
  assert.equal(new Set(AI_GATEWAY_ALIASES).size, AI_GATEWAY_ALIASES.length);
  for (const alias of AI_GATEWAY_ALIASES) {
    assert.ok(aliasTarget(alias).length > 0, "unresolved alias: " + alias);
  }
  assert.equal(aliasTarget("open-connect/auto"), "openrouter/free");
  assert.equal(aliasTarget("open-connect/open-auto"), "openrouter/auto");
  assert.equal(aliasTarget("open-connect/high"), "openai/gpt-4o");
  assert.equal(aliasTarget("open-connect/fast"), "openai/gpt-4o-mini");
  assert.equal(
    aliasTarget("open-connect/rotate-free"),
    "openrouter/free (rotates the free model pool)",
  );
});
