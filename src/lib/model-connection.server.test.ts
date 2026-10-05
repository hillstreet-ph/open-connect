import test from "node:test";
import assert from "node:assert/strict";
import { savedModelUpstreams, savedOpenRouter } from "./model-connection.server.ts";
const reference = "credential://openrouter/11111111-1111-1111-1111-111111111111";
test("resolves only the requesting user's credential and fixes the destination", async () => {
  const calls: string[] = [];
  const upstream = await savedOpenRouter("user-a", {
    find: async (id) => {
      calls.push(id);
      return { status: "connected", credential_reference: reference };
    },
    resolve: async (id, credentialId) => {
      calls.push(id, credentialId);
      return JSON.stringify({ credential: "test-key" });
    },
  });
  assert.deepEqual(calls, ["user-a", "user-a", reference.split("/").pop()]);
  assert.equal(upstream?.baseUrl, "https://openrouter.ai/api/v1");
  assert.equal(upstream?.headers.Authorization, "Bearer test-key");
});
test("no connection permits configured fallback without reading secrets", async () => {
  assert.equal(
    await savedOpenRouter("user-a", {
      find: async () => null,
      resolve: async () => {
        throw new Error("unexpected");
      },
    }),
    null,
  );
});
test("unverified or mismatched OpenRouter references fail closed", async () => {
  for (const connection of [
    { status: "pending", credential_reference: reference },
    { status: "connected", credential_reference: reference.replace("openrouter", "github") },
  ]) {
    await assert.rejects(
      savedOpenRouter("user-a", {
        find: async () => connection,
        resolve: async () => {
          throw new Error("must not resolve");
        },
      }),
    );
  }
});

test("resolves this user's connected OpenRouter and LiteLLM model gateways", async () => {
  const userIds: string[] = [];
  const refs = [
    "credential://openrouter/11111111-1111-1111-1111-111111111111",
    "credential://litellm/22222222-2222-2222-2222-222222222222",
  ];
  const upstreams = await savedModelUpstreams("user-a", {
    find: async (userId) => {
      userIds.push(userId);
      return [
        {
          provider: "openrouter",
          status: "connected",
          credential_reference: refs[0]!,
        },
        {
          provider: "litellm",
          status: "connected",
          credential_reference: refs[1]!,
          metadata: { endpoint_url: "https://proxy.example/v1/" },
        },
        {
          provider: "openai",
          status: "connected",
          credential_reference: "credential://openai/33333333-3333-3333-3333-333333333333",
        },
      ];
    },
    resolve: async (userId, credentialId) => {
      userIds.push(userId, credentialId);
      return JSON.stringify({ credential: `secret-${credentialId}` });
    },
  });
  assert.deepEqual(userIds, [
    "user-a",
    "user-a",
    refs[0]!.split("/").pop(),
    "user-a",
    refs[1]!.split("/").pop(),
  ]);
  assert.deepEqual(
    upstreams.map((upstream) => upstream.name),
    ["openrouter", "litellm"],
  );
  assert.equal(upstreams[0]?.baseUrl, "https://openrouter.ai/api/v1");
  assert.equal(upstreams[1]?.baseUrl, "https://proxy.example/v1");
  assert.equal(
    upstreams[1]?.headers["Authorization"],
    `Bearer secret-${refs[1]!.split("/").pop()}`,
  );
});

test("stale gateway references are skipped and valid LiteLLM endpoints must be public HTTPS", async () => {
  const skipped = await savedModelUpstreams("user-a", {
    find: async () => [
      {
        provider: "litellm",
        status: "connected",
        credential_reference: "credential://openrouter/11111111-1111-1111-1111-111111111111",
        metadata: { endpoint_url: "http://proxy.example/v1" },
      },
    ],
    resolve: async () => "must-not-resolve",
  });
  assert.deepEqual(skipped, []);
  await assert.rejects(
    savedModelUpstreams("user-a", {
      find: async () => [
        {
          provider: "litellm",
          status: "connected",
          credential_reference: "credential://litellm/11111111-1111-1111-1111-111111111111",
          metadata: { endpoint_url: "https://10.0.0.8/v1" },
        },
      ],
      resolve: async () => "secret",
    }),
    /public HTTPS/,
  );
});
