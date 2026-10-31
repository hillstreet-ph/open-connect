import assert from "node:assert/strict";
import test from "node:test";
import {
  composioImportBatches,
  composioImportRecords,
  planComposioAccountMapping,
  planComposioSync,
} from "./composio-sync.ts";

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

test("native credentials linked to an exact broker account are preserved without exposing references", () => {
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
  assert.deepEqual(plan.candidates, []);
  assert.equal(plan.existing, 1);
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

test("explicit imports reject foreign accounts and never add provider scopes", () => {
  const accounts = [
    { id: "ca_one", provider: "gmail" },
    { id: "ca_two", provider: "gmail" },
  ];
  assert.throws(
    () => composioImportRecords("owner", accounts, [], [], ["foreign"]),
    /owned ACTIVE/,
  );
  assert.throws(() => composioImportRecords("owner", accounts, [], [], []), /Select/);
  const plan = composioImportRecords("owner", accounts, [], [], ["ca_one", "ca_one"]);
  assert.equal(plan.records.length, 1);
  assert.equal(plan.records[0]?.user_id, "owner");
  assert.deepEqual(plan.records[0]?.scopes, []);
  assert.equal(plan.records[0]?.metadata.validation.execution_verified, false);
  const existing = composioImportRecords(
    "owner",
    accounts,
    [
      {
        provider: "gmail",
        provider_account_id: "ca_one",
        credential_reference: "composio://connected-account/ca_one",
      },
    ],
    [],
    ["ca_one"],
  );
  assert.equal(existing.records.length, 0);
});

test("website sync-all imports every candidate in bounded batches and retries existing mappings safely", () => {
  const accounts = Array.from({ length: 252 }, (_, i) => ({ id: `ca_${i}`, provider: "gmail" }));
  const saved = [
    {
      provider: "gmail",
      provider_account_id: "ca_0",
      credential_reference: "composio://connected-account/ca_0",
    },
  ];
  const plan = composioImportBatches("owner", accounts, saved, []);
  assert.deepEqual(
    plan.batches.map((batch) => batch.length),
    [100, 100, 51],
  );
  const rows = plan.batches.flat();
  assert.equal(new Set(rows.map((row) => row.credential_reference)).size, 251);
  assert.equal(plan.matched, 252);
  assert.equal(plan.existing, 1);
  assert.equal(composioImportBatches("owner", accounts, [...saved, ...rows], []).batches.length, 0);
  assert.throws(
    () =>
      composioImportRecords(
        "owner",
        accounts,
        [],
        [],
        accounts.map((a) => a.id),
      ),
    /1–100/,
  );
});

test("composio ai provider accounts sync under their open-connect gateway provider", () => {
  const accounts = [
    { id: "ca_nim", provider: "nvidia_nim" },
    { id: "ca_grok", provider: "grok" },
    { id: "ca_gmail", provider: "gmail" },
  ];
  const plan = planComposioSync(accounts, [], [{ slug: "gmail", name: "Gmail" }]);
  assert.deepEqual(
    plan.candidates.map((candidate) => `${candidate.provider}:${candidate.display_name}`),
    ["nvidia:NVIDIA NIM", "xai:xAI / Grok", "gmail:Gmail"],
  );
  const imported = composioImportRecords(
    "owner",
    accounts,
    [],
    [],
    ["ca_nim", "ca_grok", "ca_gmail"],
  );
  assert.equal(imported.records[0]?.provider, "nvidia");
  assert.equal(imported.records[0]?.display_name, "NVIDIA NIM");
  assert.equal(imported.records[1]?.provider, "xai");
  assert.equal(imported.records[2]?.provider, "gmail");
  assert.equal(
    imported.records.every((record) => record.credential_reference?.startsWith("composio://")),
    true,
  );
  const saved = imported.records.map((record) => ({
    provider: record.provider,
    provider_account_id: record.provider_account_id,
    credential_reference: record.credential_reference,
  }));
  assert.equal(composioImportBatches("owner", accounts, saved, []).batches.length, 0);
});

test("native account matches require both provider and exact account ID; no-op import preserves bindings", () => {
  const accounts = [{ id: "ca_native", provider: "custom_app" }];
  const saved = [
    {
      id: "native",
      provider: "custom_app",
      provider_account_id: "ca_native",
      credential_reference: "credential://custom_app/opaque",
    },
  ];
  assert.equal(
    composioImportRecords("owner", accounts, saved, [], ["ca_native"]).records.length,
    0,
  );
  const mapping = planComposioAccountMapping("external", accounts, saved, []);
  assert.equal(mapping.connections[0]?.connection_id, "native");
  assert.equal(mapping.candidate_count, 0);
  assert.equal(
    planComposioSync(accounts, [{ ...saved[0]!, provider: "other" }], []).candidates.length,
    1,
  );
  assert.equal(
    planComposioSync(accounts, [{ ...saved[0]!, provider_account_id: "ca_other" }], []).candidates
      .length,
    1,
  );
  assert.equal(saved[0]?.credential_reference, "credential://custom_app/opaque");
});
