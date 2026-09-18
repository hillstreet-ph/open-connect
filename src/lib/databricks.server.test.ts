import assert from "node:assert/strict";
import test from "node:test";
import { databricksConfig, pseudonymizeUserId } from "./databricks.server.ts";

test("Databricks config is disabled when credentials are absent", () => {
  const values = ["DATABRICKS_HOST", "DATABRICKS_TOKEN", "DATABRICKS_WAREHOUSE_ID"] as const;
  const previous = Object.fromEntries(values.map((name) => [name, process.env[name]]));
  for (const name of values) delete process.env[name];
  assert.equal(databricksConfig().configured, false);
  for (const name of values) {
    if (previous[name] === undefined) delete process.env[name];
    else process.env[name] = previous[name];
  }
});

test("Databricks config rejects unsafe SQL identifiers", () => {
  const previous = process.env.DATABRICKS_CATALOG;
  process.env.DATABRICKS_CATALOG = "open_connect; DROP TABLE x";
  assert.throws(() => databricksConfig(), /simple SQL identifiers/);
  if (previous === undefined) delete process.env.DATABRICKS_CATALOG;
  else process.env.DATABRICKS_CATALOG = previous;
});

test("user identifiers are deterministically pseudonymized", () => {
  const previous = process.env.DATABRICKS_PSEUDONYMIZATION_KEY;
  process.env.DATABRICKS_PSEUDONYMIZATION_KEY = "test-only-key";
  const first = pseudonymizeUserId("user-123");
  assert.equal(first, pseudonymizeUserId("user-123"));
  assert.notEqual(first, pseudonymizeUserId("user-456"));
  assert.equal(first.length, 64);
  if (previous === undefined) delete process.env.DATABRICKS_PSEUDONYMIZATION_KEY;
  else process.env.DATABRICKS_PSEUDONYMIZATION_KEY = previous;
});
