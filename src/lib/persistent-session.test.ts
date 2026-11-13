import test from "node:test";
import assert from "node:assert/strict";
import { verifyPersistentSession } from "./persistent-session.ts";

test("restores only a server-verified user", async () => {
  const user = { id: "verified-user" };
  assert.equal(await verifyPersistentSession(async () => ({ data: { user }, error: null })), user);
});
test("a transient auth outage recovers without requiring sign-in", async () => {
  let attempts = 0;
  const user = { id: "verified-user" };
  const result = await verifyPersistentSession(async () =>
    ++attempts === 1
      ? { data: { user: null }, error: { status: 503 } }
      : { data: { user }, error: null },
  );
  assert.equal(result, user);
  assert.equal(attempts, 2);
});
test("persistent network failure blocks access without declaring logout", async () => {
  let attempts = 0;
  await assert.rejects(
    verifyPersistentSession(async () => {
      attempts++;
      throw new Error("private network diagnostic");
    }),
    /saved sign-in could not be verified/,
  );
  assert.equal(attempts, 2);
});
test("rejected and missing sessions require reauthentication, without retries", async () => {
  for (const error of [
    { status: 401 },
    { status: 403 },
    { status: 400 },
    { name: "AuthSessionMissingError" },
  ]) {
    let calls = 0;
    assert.equal(
      await verifyPersistentSession(async () => {
        calls++;
        return { data: { user: { id: "untrusted" } }, error };
      }),
      null,
    );
    assert.equal(calls, 1);
  }
  assert.equal(
    await verifyPersistentSession(async () => ({ data: { user: null }, error: null })),
    null,
  );
});
test("rate limits and unknown errors never authenticate a cached user", async () => {
  for (const error of [{ status: 429 }, { status: 500 }, { name: "UnknownFailure" }]) {
    await assert.rejects(
      verifyPersistentSession(async () => ({ data: { user: { id: "untrusted" } }, error })),
      /saved sign-in could not be verified/,
    );
  }
});
