import assert from "node:assert/strict";
import test from "node:test";
import { managedConnectorReady } from "./managed-connectors.server.ts";

test("managed connectors require both a broker key and provider auth config", () => {
  const originalKey = process.env["COMPOSIO_API_KEY"];
  const originalConfigs = process.env["COMPOSIO_AUTH_CONFIGS"];
  try {
    delete process.env["COMPOSIO_API_KEY"];
    delete process.env["COMPOSIO_AUTH_CONFIGS"];
    assert.equal(managedConnectorReady("slack"), false);

    process.env["COMPOSIO_API_KEY"] = "test-key";
    process.env["COMPOSIO_AUTH_CONFIGS"] = JSON.stringify({ slack: "ac_slack" });
    assert.equal(managedConnectorReady("slack"), true);
    assert.equal(managedConnectorReady("github"), false);
  } finally {
    if (originalKey === undefined) delete process.env["COMPOSIO_API_KEY"];
    else process.env["COMPOSIO_API_KEY"] = originalKey;
    if (originalConfigs === undefined) delete process.env["COMPOSIO_AUTH_CONFIGS"];
    else process.env["COMPOSIO_AUTH_CONFIGS"] = originalConfigs;
  }
});

test("invalid broker configuration never enables a connector", () => {
  const original = process.env["COMPOSIO_AUTH_CONFIGS"];
  try {
    process.env["COMPOSIO_API_KEY"] = "test-key";
    process.env["COMPOSIO_AUTH_CONFIGS"] = "not-json";
    assert.equal(managedConnectorReady("gmail"), false);
  } finally {
    if (original === undefined) delete process.env["COMPOSIO_AUTH_CONFIGS"];
    else process.env["COMPOSIO_AUTH_CONFIGS"] = original;
    delete process.env["COMPOSIO_API_KEY"];
  }
});
