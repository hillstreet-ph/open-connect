import assert from "node:assert/strict";
import test from "node:test";
import { planComposioAccountMapping, planComposioSync } from "./composio-sync.ts";

test("provider alias changes do not reimport the same broker account", () => {
  const plan = planComposioSync(
    [{ id: "ca_drive", provider: "googledrive" }],
    [
      {
        provider: "google_drive",
        provider_account_id: "ca_drive",
        credential_reference: "composio://connected-account/ca_drive",
      },
    ],
    [{ slug: "googledrive", name: "Google Drive" }],
  );
  assert.equal(plan.existing, 1);
  assert.deepEqual(plan.candidates, []);
});

test("separate accounts survive while repeated pages produce one candidate per account", () => {
  const plan = planComposioSync(
    [
      { id: "ca_one", provider: "gmail" },
      { id: "ca_one", provider: "gmail" },
      { id: "ca_two", provider: "gmail" },
    ],
    [],
    [{ slug: "gmail", name: "Gmail" }],
  );
  assert.equal(plan.matched, 2);
  assert.equal(plan.candidates.length, 2);
});

test("native credentials do not shadow a broker account and preview exposes no references", () => {
  const plan = planComposioSync(
    [{ id: "ca_native", provider: "custom_app" }],
    [
      {
        provider: "custom_app",
        provider_account_id: "ca_native",
        credential_reference: "credential://custom_app/opaque",
      },
    ],
    [],
  );
  assert.equal(plan.candidates[0]?.display_name, "custom_app");
  assert.equal(plan.existing, 0);
  assert.doesNotMatch(JSON.stringify(plan), /credential:\/\/|composio:\/\//);
});

test("account mapping emits only allowlisted connection fields", () => {
  const mapping = planComposioAccountMapping(
    "apify_sequin-mainan",
    [{ id: "ca_apify", provider: "apify" }],
    [
      {
        id: "connection-apify",
        provider: "apify",
        display_name: "Apify",
        provider_account_id: "ca_apify",
        credential_reference: "composio://connected-account/ca_apify",
      },
    ],
    [{ slug: "apify", name: "Apify toolkit" }],
  );

  assert.deepEqual(mapping, {
    external_account_id: "apify_sequin-mainan",
    matched: 1,
    existing: 1,
    candidate_count: 0,
    connections: [
      {
        provider: "apify",
        display_name: "Apify",
        sync_state: "existing",
        connection_id: "connection-apify",
      },
    ],
  });
  assert.doesNotMatch(JSON.stringify(mapping), /ca_apify|credential_reference|provider_account_id/);
});
