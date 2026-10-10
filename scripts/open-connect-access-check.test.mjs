import assert from "node:assert/strict";
import test from "node:test";
import { checkOpenConnectAccess } from "./open-connect-access-check.mjs";

const key = "oc_live_fixture_only";
const metadata = {
  authenticated: true,
  scopes: ["mcp:connect", "knowledge:read"],
  context: { project_id: "fixture-project", access_profile: "custom" },
};
test("verifies the required scopes and exact project without returning credential or knowledge values", async () => {
  const result = await checkOpenConnectAccess({
    key,
    projectId: "fixture-project",
    requiredScopes: ["knowledge:read"],
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://open-connect.site/mcp");
      assert.equal(options.redirect, "error");
      assert.equal(options.headers.Authorization, `Bearer ${key}`);
      return Response.json(metadata);
    },
  });
  assert.equal(result.status, "verified");
  assert.equal(JSON.stringify(result).includes(key), false);
});
test("distinguishes missing permissions and mismatched project", async () => {
  const fetchImpl = async () => Response.json(metadata);
  assert.equal(
    (await checkOpenConnectAccess({ key, projectId: "different", fetchImpl })).status,
    "project_boundary_mismatch",
  );
  assert.deepEqual(
    (await checkOpenConnectAccess({ key, requiredScopes: ["memory:read"], fetchImpl }))
      .missing_scopes,
    ["memory:read"],
  );
});
test("configuration errors make no HTTP request", async () => {
  for (const key of [undefined, "${UNSET}", "not-a-key"]) {
    const result = await checkOpenConnectAccess({
      key,
      fetchImpl: () => {
        throw new Error("Must not call");
      },
    });
    assert.equal(result.status, "configuration_error");
  }
});
test("denials and network exceptions are bounded and never expose their body", async () => {
  let calls = 0;
  const result = await checkOpenConnectAccess({
    key,
    fetchImpl: async () => {
      calls++;
      return new Response(key, { status: 403 });
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.status, "gateway_or_transport_denial");
  assert.equal(JSON.stringify(result).includes(key), false);
  const failed = await checkOpenConnectAccess({
    key,
    fetchImpl: async () => {
      throw new Error(key);
    },
  });
  assert.deepEqual(failed, { status: "transport_error" });
});
test("rejects malformed successful gateway responses", async () => {
  const result = await checkOpenConnectAccess({
    key,
    fetchImpl: async () => Response.json({ scopes: "all" }),
  });
  assert.equal(result.status, "invalid_gateway_response");
});
