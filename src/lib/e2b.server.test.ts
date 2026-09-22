import assert from "node:assert/strict";
import test from "node:test";
import { createE2bSandbox, e2bConfig, killE2bSandbox, listE2bSandboxes } from "./e2b.server.ts";

test("E2B reports unconfigured without a runtime secret", () => {
  const previous = process.env["E2B_API_KEY"];
  delete process.env["E2B_API_KEY"];
  assert.equal(e2bConfig().configured, false);
  if (previous) process.env["E2B_API_KEY"] = previous;
});

test("E2B requests use a secret header without returning it", async () => {
  const previousKey = process.env["E2B_API_KEY"];
  const previousFetch = globalThis.fetch;
  process.env["E2B_API_KEY"] = "test-secret-not-for-output";
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;
  try {
    await listE2bSandboxes(1000);
    await createE2bSandbox({ template: "base", timeout: 10, metadata: { project: "test" } });
    await killE2bSandbox("sandbox_123456");
    assert.match(calls[0]!.url, /limit=100$/);
    assert.equal(
      (calls[0]!.init?.headers as Record<string, string>)["x-api-key"],
      process.env["E2B_API_KEY"],
    );
    assert.equal(JSON.parse(String(calls[1]!.init?.body)).timeout, 30);
    assert.equal(calls[2]!.init?.method, "DELETE");
    assert.doesNotMatch(JSON.stringify(calls.map((call) => call.url)), /test-secret/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey) process.env["E2B_API_KEY"] = previousKey;
    else delete process.env["E2B_API_KEY"];
  }
});

test("E2B rejects malformed sandbox ids", async () => {
  await assert.rejects(() => killE2bSandbox("../bad"), /Invalid E2B sandbox id/);
});
