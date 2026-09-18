import assert from "node:assert/strict";
import test from "node:test";
import { databricksConfig } from "./databricks.server.ts";

test("Databricks config is disabled when credentials are absent", () => {
  const snapshot = { ...process.env };
  delete process.env.DATABRICKS_HOST;
  delete process.env.DATABRICKS_TOKEN;
  delete process.env.DATABRICKS_WAREHOUSE_ID;
  assert.equal(databricksConfig().configured, false);
  process.env = snapshot;
});

test("Databricks config rejects unsafe SQL identifiers", () => {
  const previous = process.env.DATABRICKS_CATALOG;
  process.env.DATABRICKS_CATALOG = "open_connect; DROP TABLE x";
  assert.throws(() => databricksConfig(), /simple SQL identifiers/);
  if (previous === undefined) delete process.env.DATABRICKS_CATALOG;
  else process.env.DATABRICKS_CATALOG = previous;
});
