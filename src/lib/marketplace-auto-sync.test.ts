import assert from "node:assert/strict";
import test from "node:test";
import { isKobePlayMarketplaceResource } from "./marketplace-auto-sync.ts";

test("matches marketplace resources explicitly for OpenAI or ChatGPT clients", () => {
  assert.equal(
    isKobePlayMarketplaceResource({
      slug: "generic-skill",
      name: "Generic skill",
      supported_clients: ["openai-compatible"],
    }),
    true,
  );
  assert.equal(
    isKobePlayMarketplaceResource({
      slug: "chatgpt-tool",
      name: "Tool",
      supported_clients: [],
    }),
    true,
  );
});

test("matches Airtable, Notion, and Google workspace resources", () => {
  for (const client of [
    "airtable",
    "notion",
    "google-drive",
    "google-docs",
    "google-sheets",
    "gmail",
  ]) {
    assert.equal(
      isKobePlayMarketplaceResource({
        slug: "resource",
        name: "Resource",
        supported_clients: [client],
      }),
      true,
    );
  }
});

test("does not match unrelated marketplace resources", () => {
  assert.equal(
    isKobePlayMarketplaceResource({
      slug: "generic-skill",
      name: "Generic skill",
      description: "Works with an open source AI model.",
      supported_clients: ["claude", "cursor"],
      category_slug: "developer",
    }),
    false,
  );
});
