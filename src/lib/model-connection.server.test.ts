import test from "node:test";
import assert from "node:assert/strict";
import { savedOpenRouter } from "./model-connection.server.ts";
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
test("unverified or mismatched connections fail closed", async () => {
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
