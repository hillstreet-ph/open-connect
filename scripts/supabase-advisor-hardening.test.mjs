import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260920130000_harden_advisor_exposed_functions.sql",
    import.meta.url,
  ),
  "utf8",
);

test("credential metadata view uses caller privileges", () => {
  assert.match(
    migration,
    /alter view public\.credential_secrets_meta set \(security_invoker = true\)/i,
  );
});

test("membership helpers cannot inspect another signed-in user", () => {
  assert.equal((migration.match(/p_user_id = auth\.uid\(\)/g) ?? []).length, 2);
  assert.match(
    migration,
    /revoke all on function platform\.user_in_org\(uuid, uuid\) from public, anon/i,
  );
  assert.match(
    migration,
    /revoke all on function platform\.user_role\(uuid, uuid\) from public, anon/i,
  );
});

test("trigger and legacy OAuth helpers are server-only", () => {
  assert.match(
    migration,
    /sync_authorized_identity\(\)[\s\S]*from public, anon, authenticated/i,
  );
  for (const name of [
    "oc_authorize_oauth_client",
    "oc_exchange_oauth_code",
    "oc_register_oauth_client",
    "oc_verify_gateway_key",
  ]) {
    assert.match(
      migration,
      new RegExp(`revoke all on function public\\.${name}\\([\\s\\S]*?authenticated`, "i"),
    );
  }
});

test("credential RPCs keep their existing authenticated contract", () => {
  assert.doesNotMatch(
    migration,
    /(?:list|create|delete)_credential_secret[\s\S]*from[\s\S]*authenticated/i,
  );
});
