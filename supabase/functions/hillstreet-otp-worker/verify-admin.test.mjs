import assert from "node:assert/strict";
import test from "node:test";
import { ensureKobePlayVerify } from "./verify-admin.mjs";
import { createBackend } from "./backend.mjs";
import { createIngress, desiredNumberConfig, eligibleNumber, recordingTwiml } from "./platform.mjs";

const sid = "VA" + "a".repeat(32);
const configured = {
  sid,
  friendly_name: "KobePlay",
  code_length: 6,
  custom_code_enabled: false,
  lookup_enabled: true,
  skip_sms_to_landlines: true,
  do_not_share_warning_enabled: true,
};

test("creates a dedicated service without changing legacy services and verifies the result", async () => {
  const writes = [];
  const saved = await ensureKobePlayVerify(async (path, options) => {
    if (path === "/Services?PageSize=100")
      return {
        services: [{ sid: "VA" + "b".repeat(32), friendly_name: "Legacy" }],
        meta: { next_page_url: null },
      };
    if (options?.method === "POST") {
      writes.push({ path, body: Object.fromEntries(options.body) });
      return configured;
    }
    assert.equal(path, "/Services/" + sid);
    return configured;
  });
  assert.equal(saved.sid, sid);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].path, "/Services");
  assert.equal(writes[0].body.CustomCodeEnabled, "false");
});
test("does not create or mutate an already configured service", async () => {
  await ensureKobePlayVerify(async (path, options) => {
    assert.equal(options, undefined);
    return path.includes("?")
      ? { services: [configured], meta: { next_page_url: null } }
      : configured;
  });
});
test("rejects duplicate services and untrusted pagination before a mutation", async () => {
  for (const data of [
    { services: [configured, configured] },
    { services: [], meta: { next_page_url: "https://evil.example/v2/Services" } },
  ]) {
    await assert.rejects(
      ensureKobePlayVerify(async (_path, options) => {
        assert.equal(options, undefined);
        return data;
      }),
    );
  }
});
test("configuration must pass provider readback", async () => {
  await assert.rejects(
    ensureKobePlayVerify(async (path, options) => {
      if (path.includes("?")) return { services: [] };
      if (options) return configured;
      return { ...configured, code_length: 4 };
    }),
    /verify_readback_failed/,
  );
});
test("Verify provisioning requires worker authentication before provider access", async () => {
  const original = globalThis.fetch;
  let touched = false;
  globalThis.fetch = async () => {
    touched = true;
    throw new Error("must not fetch");
  };
  try {
    const backend = createBackend({
      root: "https://db.example",
      serviceKey: "fixture",
      background: () => {},
    });
    const response = await backend.worker(
      new Request("https://worker.example", {
        method: "POST",
        body: JSON.stringify({ provision_verify: true }),
      }),
    );
    assert.equal(response.status, 401);
    assert.equal(touched, false);
  } finally {
    globalThis.fetch = original;
  }
});
test("unsigned inbound requests are rejected before enqueueing", async () => {
  const ingress = createIngress({});
  const response = await ingress(
    new Request("https://worker.example/hillstreet-otp-forwarder", {
      method: "POST",
      body: "Body=test",
    }),
  );
  assert.equal(response.status, 403);
});

test("authenticated setup persists only public Verify metadata and releases the lease", async () => {
  const token = "c".repeat(64);
  const hash = Buffer.from(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
  ).toString("hex");
  const accountSid = "AC" + "a".repeat(32);
  const runtime = {
    account_sid: accountSid,
    user_id: "owner",
    api_credential_id: "credential",
    worker_key_hash: hash,
  };
  const original = globalThis.fetch;
  let created = false,
    persisted = null,
    released = false;
  globalThis.fetch = async (input, options) => {
    const url = new URL(String(input));
    if (url.origin === "https://verify.twilio.com") {
      assert.equal(options.redirect, "manual");
      if (url.search) return Response.json({ services: [], meta: { next_page_url: null } });
      if (options.method === "POST") {
        created = true;
        return Response.json(configured);
      }
      return Response.json(configured);
    }
    assert.equal(url.origin, "https://db.example");
    const body = options.body ? JSON.parse(options.body) : null;
    if (url.pathname.endsWith("/hillstreet_otp_runtime")) {
      if (options.method === "PATCH") {
        released = body.lease_token === null;
        return Response.json([runtime]);
      }
      return Response.json([runtime]);
    }
    if (url.pathname.endsWith("/hillstreet_acquire_otp_worker")) return Response.json("lease");
    if (url.pathname.endsWith("/resolve_connection_credential"))
      return Response.json(
        JSON.stringify({
          account_sid: accountSid,
          api_key_sid: "SK" + "b".repeat(32),
          api_key_secret: "fixture-secret",
        }),
      );
    if (url.pathname.endsWith("/app_connections")) {
      if (options.method === "PATCH") {
        persisted = body;
        return Response.json([body]);
      }
      return Response.json([{ id: "connection", metadata: { preserved: true } }]);
    }
    throw new Error("Unexpected request " + url.pathname);
  };
  try {
    const backend = createBackend({
      root: "https://db.example",
      serviceKey: "fixture",
      background: () => {},
    });
    const response = await backend.worker(
      new Request("https://worker.example", {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
        body: JSON.stringify({ account_sid: accountSid, provision_verify: true }),
      }),
    );
    assert.equal(response.status, 200);
    assert.equal((await response.json()).verify.sid, sid);
    assert.equal(created, true);
    assert.equal(released, true);
    assert.equal(persisted.metadata.preserved, true);
    assert.equal(persisted.metadata.kobeplay_verify.integration_status, "backend_wiring_required");
    assert.ok(!JSON.stringify(persisted).includes("fixture-secret"));
  } finally {
    globalThis.fetch = original;
  }
});
test("future-number adoption leaves player and explicitly unrelated numbers separate", () => {
  const runtime = {
    auto_enroll_prefix: "HillStreet / OTP",
    function_base_url: "https://forward.example",
    voice_requested: true,
  };
  assert.equal(eligibleNumber({ friendly_name: "KobePlay player" }, null, runtime), false);
  assert.equal(
    eligibleNumber({ friendly_name: "HillStreet / OTP Telegram - Test 2" }, null, runtime),
    true,
  );
  const desired = desiredNumberConfig({ capabilities: { sms: true, voice: true } }, runtime, {
    type: "Full",
    status: "active",
  });
  assert.equal(desired.voice, true);
  assert.equal(desired.body.VoiceMethod, "POST");
  const xml = recordingTwiml({ canonical_url: "https://forward.example" });
  assert.ok(xml.includes('track="inbound"'));
  assert.ok(xml.includes("/recording#rc=2&amp;rp="));
});
