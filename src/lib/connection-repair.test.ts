import test from "node:test";
import assert from "node:assert/strict";
import {
  repairOwnedConnection,
  type RepairConnection,
  type RepairInput,
} from "./connection-repair.ts";
const id = "00000000-0000-4000-8000-000000000001";
const keyId = "00000000-0000-4000-8000-000000000002";
const row: RepairConnection = {
  id,
  user_id: "owner",
  provider: "custom_tinyfish_mcp",
  display_name: "TinyFish",
  status: "connected",
  credential_reference: `credential://custom_tinyfish_mcp/${keyId}`,
  metadata: { disabled_tools: ["delete"], secret: "never-return-this" },
  scopes: ["tools:invoke"],
  updated_at: "revision-1",
};
function fixture(changes: Partial<RepairConnection> = {}) {
  let writes = 0,
    validations = 0;
  let candidate: RepairConnection | undefined;
  const deps = {
    load: async () => ({ ...row, ...changes }),
    credential: async (
      _id: string,
    ): Promise<{ secret_type: string; website: string | null } | null> => ({
      secret_type: "api_key",
      website: null,
    }),
    validate: async (value: RepairConnection) => {
      validations++;
      candidate = value;
      return 3;
    },
    update: async (value: RepairConnection, expected: string): Promise<RepairConnection | null> => {
      writes++;
      assert.equal(expected, "revision-1");
      return value;
    },
  };
  const run = (input: Partial<RepairInput> = {}) =>
    repairOwnedConnection(
      "owner",
      { connection_id: id, action: "apply", expected_updated_at: "revision-1", ...input },
      deps,
    );
  return { deps, run, counts: () => ({ writes, validations }), candidate: () => candidate };
}
test("inspect returns a sanitized exact snapshot without accessing keys or providers", async () => {
  const f = fixture();
  const result = await f.run({ action: "inspect" });
  assert.equal(result.connection.id, id);
  assert.equal(result.connection.credential_id, keyId);
  assert.doesNotMatch(JSON.stringify(result), /never-return-this|disabled_tools/);
  assert.deepEqual(f.counts(), { writes: 0, validations: 0 });
});
test("foreign ownership and stale revisions stop before provider validation or mutation", async () => {
  const foreign = fixture({ user_id: "another-owner" });
  await assert.rejects(foreign.run(), /Owned connection not found/);
  const stale = fixture();
  await assert.rejects(stale.run({ expected_updated_at: "old" }), /Connection changed/);
  assert.deepEqual(stale.counts(), { writes: 0, validations: 0 });
});
test("an owned API key repairs exactly one record and preserves scopes and disabled tools", async () => {
  const f = fixture();
  const result = await f.run({ credential_id: keyId });
  assert.equal(result.applied, true);
  assert.deepEqual(f.counts(), { writes: 1, validations: 1 });
  assert.deepEqual(f.candidate()?.scopes, row.scopes);
  assert.deepEqual(f.candidate()?.metadata["disabled_tools"], ["delete"]);
  assert.equal(f.candidate()?.id, id);
});
test("provider failure never changes a connection and diagnostics stay private", async () => {
  const f = fixture();
  f.deps.validate = async () => {
    throw new Error("token=private");
  };
  await assert.rejects(
    f.run(),
    /^Error: Provider validation failed\. The connection was not changed\.$/,
  );
  assert.equal(f.counts().writes, 0);
});
test("validation previews never write and a concurrent update cannot be overwritten", async () => {
  const f = fixture();
  assert.equal((await f.run({ action: "validate" })).applied, false);
  assert.equal(f.counts().writes, 0);
  f.deps.update = async () => null;
  await assert.rejects(f.run(), /Connection changed during validation/);
});
test("passwords and missing credentials cannot be bound as API keys", async () => {
  for (const secret_type of ["password", "bot_token"]) {
    const f = fixture();
    f.deps.credential = async () => ({ secret_type, website: null });
    await assert.rejects(f.run({ credential_id: keyId }), /owned API key/);
    assert.equal(f.counts().validations, 0);
  }
});
test("fixed hosted endpoints and cross-origin key exfiltration are rejected", async () => {
  await assert.rejects(
    fixture().run({ endpoint_url: "https://attacker.example/mcp" }),
    /endpoints are fixed/,
  );
  const f = fixture({
    provider: "custom_mcp",
    metadata: { endpoint_url: "https://trusted.example/mcp" },
  });
  await assert.rejects(f.run({ endpoint_url: "https://attacker.example/mcp" }), /Endpoint origin/);
  await assert.rejects(
    f.run({ endpoint_url: "https://trusted.example/mcp?token=private" }),
    /query parameters/,
  );
  assert.equal(f.counts().validations, 0);
});
test("same-origin endpoint correction and official Apify origin are validated", async () => {
  const f = fixture({
    provider: "custom_mcp",
    metadata: { endpoint_url: "https://trusted.example/old" },
  });
  await f.run({ endpoint_url: "https://trusted.example/mcp" });
  assert.equal(f.candidate()?.metadata["endpoint_url"], "https://trusted.example/mcp");
  const apify = fixture({ provider: "apify_mcp", metadata: {} });
  await assert.rejects(
    apify.run({ endpoint_url: "https://attacker.example/mcp" }),
    /Apify MCP endpoint/,
  );
  await apify.run({ endpoint_url: "https://mcp.apify.com" });
});

test("inspection never returns credential-bearing URLs or metadata", async () => {
  const f = fixture({
    metadata: { endpoint_url: "https://trusted.example/mcp?token=private", auth_header: "private" },
  });
  const result = await f.run({ action: "inspect" });
  assert.equal(result.connection.endpoint_url, null);
  assert.doesNotMatch(JSON.stringify(result), /token=private|auth_header/);
});
