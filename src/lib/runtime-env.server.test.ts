import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  hydrateRuntimeEnv,
  injectRuntimeBindings,
  runWithRuntimeEnv,
} from "./runtime-env.server.ts";

describe("injectRuntimeBindings", () => {
  it("copies only non-empty string bindings", () => {
    const target: Record<string, string | undefined> = {};

    injectRuntimeBindings(
      {
        SUPABASE_URL: "https://example.supabase.co",
        EMPTY: "",
        OC_KV: { get() {} },
        RETRIES: 3,
        ENABLED: true,
      },
      target,
    );

    assert.deepEqual(target, {
      SUPABASE_URL: "https://example.supabase.co",
    });
  });

  it("does not replace an explicitly configured environment value", () => {
    const target = { OPENROUTER_BASE_URL: "https://configured.example" };

    injectRuntimeBindings({ OPENROUTER_BASE_URL: "https://binding.example" }, target);

    assert.equal(target.OPENROUTER_BASE_URL, "https://configured.example");
  });

  it("preserves an explicitly empty fail-closed override", () => {
    const target = { OPENROUTER_API_KEY: "" };

    injectRuntimeBindings({ OPENROUTER_API_KEY: "stale-binding" }, target);

    assert.equal(target.OPENROUTER_API_KEY, "");
  });

  it("ignores absent and primitive binding collections", () => {
    const target: Record<string, string | undefined> = {};

    injectRuntimeBindings(null, target);
    injectRuntimeBindings(undefined, target);
    injectRuntimeBindings("SUPABASE_URL", target);

    assert.deepEqual(target, {});
  });
});

describe("runtime environment hydration", () => {
  it("uses the fetch environment before the Cloudflare runtime fallback", async () => {
    const target: Record<string, string | undefined> = {};

    await hydrateRuntimeEnv(
      { SHARED: "fetch", FETCH_ONLY: "fetch" },
      async () => ({ SHARED: "runtime", RUNTIME_ONLY: "runtime" }),
      target,
    );

    assert.deepEqual(target, {
      SHARED: "fetch",
      FETCH_ONLY: "fetch",
      RUNTIME_ONLY: "runtime",
    });
  });

  it("finishes runtime fallback hydration before application loading", async () => {
    const target: Record<string, string | undefined> = {};
    const events: string[] = [];

    const result = await runWithRuntimeEnv(
      {},
      () => {
        events.push("application");
        assert.equal(target.RUNTIME_READY, "yes");
        return "loaded";
      },
      async () => {
        events.push("runtime");
        return { RUNTIME_READY: "yes" };
      },
      target,
    );

    assert.equal(result, "loaded");
    assert.deepEqual(events, ["runtime", "application"]);
  });
});
