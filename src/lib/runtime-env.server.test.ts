import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { injectRuntimeBindings } from "./runtime-env.server.ts";

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

  it("ignores absent and primitive binding collections", () => {
    const target: Record<string, string | undefined> = {};

    injectRuntimeBindings(null, target);
    injectRuntimeBindings(undefined, target);
    injectRuntimeBindings("SUPABASE_URL", target);

    assert.deepEqual(target, {});
  });
});
