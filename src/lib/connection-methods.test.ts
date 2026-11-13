import test from "node:test";
import assert from "node:assert/strict";
import {
  availableConnectionMethods,
  schemeConnectionMethod,
  toolkitConnectionMethods,
} from "./connection-methods.ts";

test("custom connectors expose only their own official method", () => {
  assert.deepEqual(
    availableConnectionMethods({ provider: "custom_mcp", connectionMethod: "api_key" }),
    ["mcp"],
  );
  assert.deepEqual(
    availableConnectionMethods({ provider: "custom_api", connectionMethod: "api_key" }),
    ["api_key"],
  );
});

test("curated sign-in apps list the token method only when the provider officially accepts one", () => {
  assert.deepEqual(
    availableConnectionMethods({ provider: "github", connectionMethod: "native_oauth" }),
    ["oauth", "api_key"],
  );
  assert.deepEqual(
    availableConnectionMethods({ provider: "slack", connectionMethod: "managed_oauth" }),
    ["oauth", "api_key"],
  );
  assert.deepEqual(
    availableConnectionMethods({ provider: "google_sheets", connectionMethod: "managed_oauth" }),
    ["oauth"],
  );
  assert.deepEqual(
    availableConnectionMethods({ provider: "notion", connectionMethod: "managed_oauth" }),
    ["oauth"],
  );
});

test("API-key-only apps never advertise a provider sign-in", () => {
  assert.deepEqual(
    availableConnectionMethods({ provider: "telegram", connectionMethod: "api_key" }),
    ["api_key"],
  );
  assert.deepEqual(
    availableConnectionMethods({ provider: "sentry", connectionMethod: "api_key" }),
    ["api_key"],
  );
  assert.deepEqual(
    availableConnectionMethods({ provider: "tinyfish", connectionMethod: "api_key" }),
    ["api_key"],
  );
});

test("brokered toolkits surface every official scheme they support", () => {
  assert.deepEqual(toolkitConnectionMethods(["OAUTH2", "API_KEY"]), ["oauth", "api_key"]);
  assert.deepEqual(toolkitConnectionMethods(["API_KEY", "BEARER_TOKEN"]), ["api_key"]);
  assert.deepEqual(toolkitConnectionMethods([]), []);
  assert.equal(schemeConnectionMethod("oauth2"), "oauth");
  assert.equal(schemeConnectionMethod("OAUTH1"), "oauth");
  assert.equal(schemeConnectionMethod("GOOGLE_SERVICE_ACCOUNT"), "api_key");
});

test("toolkit schemes extend curated methods without losing the curated token path", () => {
  assert.deepEqual(
    availableConnectionMethods({
      provider: "github",
      connectionMethod: "managed_oauth",
      authMethods: ["OAUTH2"],
    }),
    ["oauth", "api_key"],
  );
  assert.deepEqual(
    availableConnectionMethods({
      provider: "asana",
      connectionMethod: "managed_oauth",
      authMethods: ["OAUTH2", "API_KEY"],
    }),
    ["oauth", "api_key"],
  );
});
