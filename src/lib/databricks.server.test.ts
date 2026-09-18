import assert from "node:assert/strict";
import test from "node:test";
import { databricksConfig, executeDatabricksStatement } from "./databricks.server.ts";

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

test("Databricks canceled statements are not reported as successful", async () => {
  const previous = {
    host: process.env.DATABRICKS_HOST,
    token: process.env.DATABRICKS_TOKEN,
    warehouse: process.env.DATABRICKS_WAREHOUSE_ID,
    fetch: globalThis.fetch,
  };
  process.env.DATABRICKS_HOST = "https://example.cloud.databricks.com";
  process.env.DATABRICKS_TOKEN = "test-token";
  process.env.DATABRICKS_WAREHOUSE_ID = "test-warehouse";
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ status: { state: "CANCELED" } }), { status: 200 });

  await assert.rejects(() => executeDatabricksStatement("SELECT 1"), /CANCELED/);

  globalThis.fetch = previous.fetch;
  for (const [name, value] of [
    ["DATABRICKS_HOST", previous.host],
    ["DATABRICKS_TOKEN", previous.token],
    ["DATABRICKS_WAREHOUSE_ID", previous.warehouse],
  ] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});
