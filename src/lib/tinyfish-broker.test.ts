import test from "node:test";
import assert from "node:assert/strict";
import {
  createBrokeredTinyFishClient,
  tinyFishBrokerOwner,
  type TinyFishProxyRequest,
} from "./tinyfish-broker.ts";
test("accepts only ACTIVE native TinyFish accounts owned by configured identities", () => {
  const a = { status: "ACTIVE", user_id: "broker-owner", toolkit: { slug: "tinyfish" } };
  assert.equal(tinyFishBrokerOwner(a, ["owner", "broker-owner"]), "broker-owner");
  for (const bad of [
    { ...a, user_id: "foreign" },
    { ...a, status: "EXPIRED" },
    { ...a, is_disabled: true },
    { ...a, toolkit: { slug: "github" } },
  ])
    assert.throws(() => tinyFishBrokerOwner(bad, ["owner", "broker-owner"]));
});
test("profiles use fixed broker transport with no authentication fields or provider keys", async () => {
  const requests: TinyFishProxyRequest[] = [];
  const client = createBrokeredTinyFishClient(async (r) => {
    requests.push(r);
    return { status: 200, data: { profiles: [{ id: "prof_one", name: "Test" }] } };
  });
  const result = await client.listProfiles();
  assert.equal(result.profiles.length, 1);
  assert.equal(requests[0]?.endpoint, "https://agent.tinyfish.ai/v1/profiles");
  assert.deepEqual(Object.keys(requests[0]!).sort(), ["endpoint", "method"]);
  await assert.rejects(client.createBrowserSession({}), /direct provider credential/);
  assert.equal(requests.length, 1);
});
test("upstream errors are sanitized and invalid broker envelopes fail closed", async () => {
  const client = createBrokeredTinyFishClient(async () => ({
    status: 401,
    data: { error: { message: "private-provider-details" } },
  }));
  await assert.rejects(
    client.listProfiles(),
    (error) =>
      error instanceof Error &&
      !error.message.includes("private-provider-details") &&
      error.message.includes("401"),
  );
  const invalid = createBrokeredTinyFishClient(async () => ({ status: 0, data: {} }));
  await assert.rejects(invalid.listProfiles(), /invalid upstream status/);
});
