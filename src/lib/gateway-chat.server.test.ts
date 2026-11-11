import test from "node:test";
import assert from "node:assert/strict";
import { carriesStatus, requestRouteCompletion, statusError } from "./gateway-chat.server.ts";
import { CLOUDFLARE_AI_BASE_URL, CLOUDFLARE_AI_UPSTREAM_NAME } from "./cloudflare-ai.server.ts";

const cloudflareRoute = {
  model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  upstream: { name: CLOUDFLARE_AI_UPSTREAM_NAME, baseUrl: CLOUDFLARE_AI_BASE_URL, headers: {} },
};

test("the credential-free upstream never goes over HTTP", async () => {
  // The marker base URL does not serve chat completions. If this route were
  // fetched, the request would fail at the provider step — the exact defect
  // this dispatcher exists to prevent. Off Cloudflare the binding is absent,
  // so the honest outcome is a named 503, never a network call.
  const originalFetch = globalThis.fetch;
  let fetched = false;
  globalThis.fetch = (async () => {
    fetched = true;
    throw new Error("must not fetch the Workers AI marker URL");
  }) as typeof fetch;
  try {
    await assert.rejects(
      () =>
        requestRouteCompletion(cloudflareRoute, { messages: [{ role: "user", content: "hi" }] }),
      (error: unknown) => {
        assert.ok(carriesStatus(error));
        assert.equal(error.status, 503);
        assert.match(error.message, /Workers AI binding is not configured/);
        return true;
      },
    );
    assert.equal(fetched, false, "the binding path must not fall back to HTTP");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("an HTTP upstream is called at its own base URL with the resolved model", async () => {
  const originalFetch = globalThis.fetch;
  let seenUrl = "";
  let seenBody: Record<string, unknown> = {};
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    seenUrl = String(url);
    seenBody = JSON.parse(String(init.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  try {
    const payload = (await requestRouteCompletion(
      {
        model: "openai/gpt-4o-mini",
        upstream: {
          name: "openrouter",
          baseUrl: "https://openrouter.ai/api/v1",
          headers: { Authorization: "Bearer test" },
        },
      },
      { messages: [{ role: "user", content: "hi" }] },
    )) as { choices?: Array<{ message?: { content?: string } }> };
    assert.equal(seenUrl, "https://openrouter.ai/api/v1/chat/completions");
    assert.equal(seenBody["model"], "openai/gpt-4o-mini");
    assert.equal(payload.choices?.[0]?.message?.content, "ok");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a rejected credential names the upstream and the fix, not a generic failure", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: { message: "invalid key" } }), {
      status: 401,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
  try {
    await assert.rejects(
      () =>
        requestRouteCompletion(
          {
            model: "openai/gpt-4o-mini",
            upstream: {
              name: "openrouter",
              baseUrl: "https://openrouter.ai/api/v1",
              headers: {},
            },
          },
          { messages: [{ role: "user", content: "hi" }] },
        ),
      (error: unknown) => {
        assert.ok(carriesStatus(error));
        assert.equal(error.status, 401);
        assert.match(error.message, /openrouter/);
        assert.match(error.message, /AI Gateway/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a route with no usable base URL fails as a named 503 instead of a bad fetch", async () => {
  await assert.rejects(
    () =>
      requestRouteCompletion(
        { model: "some-model", upstream: { name: "litellm", baseUrl: "", headers: {} } },
        { messages: [{ role: "user", content: "hi" }] },
      ),
    (error: unknown) => {
      assert.ok(carriesStatus(error));
      assert.equal(error.status, 503);
      assert.match(error.message, /no usable base URL/);
      return true;
    },
  );
});

test("statusError and carriesStatus agree on what a status error is", () => {
  assert.equal(carriesStatus(statusError("x", 503)), true);
  assert.equal(carriesStatus(new Error("x")), false);
  assert.equal(carriesStatus(null), false);
});
