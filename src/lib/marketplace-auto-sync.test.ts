import assert from "node:assert/strict";
import test from "node:test";
import { isOpenAiMarketplaceResource } from "./marketplace-auto-sync.ts";

test("matches marketplace resources explicitly for OpenAI or ChatGPT clients", () => {
  assert.equal(
    isOpenAiMarketplaceResource({
      slug: "generic-skill",
      name: "Generic skill",
      supported_clients: ["openai-compatible"],
    }),
    true,
  );
  assert.equal(
    isOpenAiMarketplaceResource({ slug: "chatgpt-tool", name: "Tool", supported_clients: [] }),
    true,
  );
});

test("does not match unrelated marketplace resources", () => {
  assert.equal(
    isOpenAiMarketplaceResource({
      slug: "generic-skill",
      name: "Generic skill",
      description: "Works with an open source AI model.",
      supported_clients: ["claude", "cursor"],
      category_slug: "developer",
    }),
    false,
  );
});
