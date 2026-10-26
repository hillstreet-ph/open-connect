import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { createClient } from "@supabase/supabase-js";
import {
  verificationInput,
  verificationPage,
  solverTask,
  matchingSolverKeys,
  solverRequest,
  solverSolution,
  SolverResponseError,
} from "./browser-verification.ts";
import { beginVerification, readVerification } from "./browser-verification.server.ts";
import {
  verificationProbeScript,
  verificationProofScript,
  browserVerificationRequestId,
} from "./browser-verification-dom.ts";
const input = {
  requestId: "550e8400-e29b-41d4-a716-446655440000",
  browser: "tinyfish",
  browserRef: "session-1",
  pageUrl: "https://example.com/task#fragment",
  type: "turnstile" as const,
  siteKey: "public-key",
  spendApproved: true as const,
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("verification bounds HTTPS context, challenge types and explicit spending", () => {
  assert.equal(verificationInput.parse(input).pageUrl, "https://example.com/task");
  for (const pageUrl of [
    "http://example.com",
    "https://user:password@example.com",
    "https://127.0.0.1",
    "https://[::1]",
    "https://foo.internal",
    "https://foo.localhost",
    "https://example.com/?access_token=secret",
    "https://example.com:8443",
  ])
    assert.throws(() => verificationPage(pageUrl));
  for (const change of [
    { spendApproved: false },
    { browserRef: "wss://secret-cdp.example.com/token" },
    { type: "image" },
    { siteKey: "<script>" },
  ])
    assert.throws(() => verificationInput.parse({ ...input, ...change }));
  assert.equal(solverTask(verificationInput.parse(input)).type, "TurnstileTaskProxyless");
  assert.equal(
    solverTask(verificationInput.parse({ ...input, type: "recaptcha_v2" })).type,
    "RecaptchaV2TaskProxyless",
  );
});
test("solver credential selection uses exact provider ownership metadata", () => {
  const key = {
    id: "one",
    secret_type: "api_key",
    website: "https://2captcha.com",
    tags: [] as string[],
  };
  assert.equal(matchingSolverKeys([key]).length, 1);
  for (const change of [
    { website: "https://2captcha.com.evil.test" },
    { website: "https://evil.test/2captcha.com" },
    { tags: ["provider:other"] },
    { tags: ["provider:two_captcha", "provider:other"] },
    { secret_type: "password" },
  ])
    assert.equal(matchingSolverKeys([{ ...key, ...change }]).length, 0);
  assert.equal(matchingSolverKeys([{ ...key, tags: ["provider:two_captcha"] }]).length, 1);
});
test("solver requests use fixed endpoints, suppress raw errors and reject redirects", async () => {
  await solverRequest("PRIVATE", "createTask", { task: {} }, async (url, init) => {
    assert.equal(url, "https://api.2captcha.com/createTask");
    assert.equal(init?.redirect, "error");
    assert.equal(JSON.parse(String(init?.body)).clientKey, "PRIVATE");
    return json({ errorId: 0, taskId: 12 });
  });
  await assert.rejects(
    solverRequest("PRIVATE", "createTask", {}, async () => {
      throw Error("PRIVATE");
    }),
    (error) =>
      error instanceof SolverResponseError && !error.definite && !error.message.includes("PRIVATE"),
  );
  await assert.rejects(
    solverRequest("PRIVATE", "createTask", {}, async () =>
      json({ errorId: 1, errorDescription: "PRIVATE" }),
    ),
    (error) =>
      error instanceof SolverResponseError && error.definite && !error.message.includes("PRIVATE"),
  );
  assert.equal(solverSolution("turnstile", { solution: { token: "proof" } }), "proof");
  assert.throws(() => solverSolution("recaptcha_v2", { solution: { token: "wrong-kind" } }));
});
function fixture() {
  let row: Record<string, unknown> | undefined;
  let enabled = true;
  let creates = 0;
  let mode = "ok";
  let credentials = 0;
  const writes: Record<string, unknown>[] = [];
  const db = createClient("https://example.supabase.co", "test", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (url, init) => {
        const parsed = new URL(String(url));
        const table = parsed.pathname.split("/").at(-1);
        const method = init?.method ?? "GET";
        if (table === "browser_automation_preferences") {
          assert.equal(parsed.searchParams.get("user_id"), "eq.owner");
          return json({ native_assistance: true, external_assistance: enabled });
        }
        if (method === "POST") {
          const body = JSON.parse(String(init?.body));
          assert.equal(body.user_id, "owner");
          if (row) return json({ code: "23505", message: "duplicate" }, 409);
          row = { ...body, created_at: new Date().toISOString() };
          writes.push(body);
          return new Response(null, { status: 201 });
        }
        assert.equal(parsed.searchParams.get("id"), `eq.${input.requestId}`);
        const owner = parsed.searchParams.get("user_id");
        if (method === "PATCH") {
          assert.equal(owner, "eq.owner");
          const change = JSON.parse(String(init?.body));
          row = { ...row, ...change };
          writes.push(change);
          return new Response(null, { status: 204 });
        }
        return json(owner === "eq.owner" ? (row ?? null) : null);
      },
    },
  });
  const deps = {
    db,
    credential: async (owner: string, id?: string) => {
      credentials++;
      assert.equal(owner, "owner");
      if (id) assert.equal(id, "key-1");
      return { id: "key-1", key: "PRIVATE" };
    },
    send: (async (url) => {
      if (String(url).endsWith("createTask")) {
        creates++;
        if (mode === "unknown") throw Error("transport");
        return json({ errorId: 0, taskId: 123 });
      }
      if (mode === "rejected") return json({ errorId: 12 });
      return json({ errorId: 0, status: "ready", solution: { token: "ephemeral-proof" } });
    }) as typeof fetch,
  };
  return {
    deps,
    writes,
    row: () => row!,
    count: () => creates,
    credentials: () => credentials,
    enable: (value: boolean) => {
      enabled = value;
    },
    mode: (value: string) => {
      mode = value;
    },
  };
}
test("paid submission is owner-bound, idempotent and immutable; proofs are not persisted", async () => {
  const f = fixture();
  await beginVerification("owner", input, f.deps);
  assert.equal(f.count(), 1);
  const repeated = await beginVerification("owner", input, f.deps);
  assert.equal(repeated.resumed, true);
  assert.equal(f.count(), 1);
  await assert.rejects(
    beginVerification("owner", { ...input, browserRef: "other-session" }, f.deps),
    /different request/,
  );
  assert.equal(f.count(), 1);
  const ready = await readVerification("owner", input.requestId, f.deps);
  assert.equal(ready.browserRef, input.browserRef);
  assert.equal(ready.origin, "https://example.com");
  assert.equal("proof" in ready && ready.proof, "ephemeral-proof");
  assert.equal(ready.website_acceptance_verified, false);
  assert.ok(!JSON.stringify(f.writes).includes("ephemeral-proof"));
  assert.ok(!JSON.stringify(f.writes).includes("PRIVATE"));
  const before = f.credentials();
  await assert.rejects(readVerification("different-owner", input.requestId, f.deps), /unavailable/);
  assert.equal(f.credentials(), before);
  f.row()["created_at"] = "2000-01-01T00:00:00Z";
  assert.equal((await readVerification("owner", input.requestId, f.deps)).state, "expired");
  assert.equal(f.credentials(), before);
});
test("disabled policy prevents payment; uncertain submission never replays", async () => {
  const disabled = fixture();
  disabled.enable(false);
  await assert.rejects(
    beginVerification("owner", input, disabled.deps),
    /Enable external assistance/,
  );
  assert.equal(disabled.count(), 0);
  assert.equal(disabled.credentials(), 0);
  const f = fixture();
  f.mode("unknown");
  await assert.rejects(beginVerification("owner", input, f.deps), /submission_unknown/);
  assert.equal(f.row()["state"], "submission_unknown");
  assert.equal((await beginVerification("owner", input, f.deps)).resumed, true);
  assert.equal(f.count(), 1);
  const before = f.credentials();
  assert.equal(
    (await readVerification("owner", input.requestId, f.deps)).state,
    "submission_unknown",
  );
  assert.equal(f.credentials(), before);
});
test("definite polling rejection closes the attempt without proof", async () => {
  const f = fixture();
  await beginVerification("owner", input, f.deps);
  f.mode("rejected");
  await assert.rejects(readVerification("owner", input.requestId, f.deps), /rejected/);
  assert.equal(f.row()["state"], "failed");
});
test("fixed DOM proof application checks origin and widget and never submits a form", async () => {
  const field = {
    value: "",
    events: [] as string[],
    dispatchEvent(event: { type: string }) {
      this.events.push(event.type);
    },
  };
  const widget = {
    className: "cf-turnstile",
    getAttribute: () => "public-key",
    getBoundingClientRect: () => ({ width: 100, height: 50 }),
  };
  const context = {
    location: { origin: "https://example.com", href: "https://example.com/task" },
    document: {
      querySelectorAll: (selector: string) =>
        selector === "[data-sitekey]" ? [widget] : selector.startsWith("[name=") ? [field] : [],
    },
    Event: class {
      type: string;
      constructor(type: string) {
        this.type = type;
      }
    },
  };
  assert.equal(vm.runInNewContext(verificationProbeScript, context).type, "turnstile");
  const expected = { origin: context.location.origin, type: "turnstile", siteKey: "public-key" };
  assert.equal(
    vm.runInNewContext(
      verificationProofScript({ ...expected, origin: "https://other.com" }, "proof"),
      context,
    ),
    false,
  );
  assert.equal(
    vm.runInNewContext(
      verificationProofScript({ ...expected, siteKey: "changed" }, "proof"),
      context,
    ),
    false,
  );
  const proof = '"); globalThis.stolen = true; //';
  assert.equal(vm.runInNewContext(verificationProofScript(expected, proof), context), true);
  assert.equal(field.value, proof);
  assert.deepEqual(field.events, ["input", "change"]);
  assert.equal(vm.runInNewContext(verificationProbeScript, context), null);
  const id = await browserVerificationRequestId("session:tab:origin:widget");
  assert.equal(id, await browserVerificationRequestId("session:tab:origin:widget"));
  assert.notEqual(id, await browserVerificationRequestId("different-session:tab:origin:widget"));
  verificationInput.parse({ ...input, requestId: id });
});
