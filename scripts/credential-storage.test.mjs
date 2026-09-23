import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260918000000_encrypt_credential_secrets.sql", import.meta.url),
  "utf8",
);
const serverFunctions = readFileSync(
  new URL("../src/lib/secrets.functions.ts", import.meta.url),
  "utf8",
);
const passwordManagerMigration = readFileSync(
  new URL(
    "../supabase/migrations/20260924010000_password_manager_credentials.sql",
    import.meta.url,
  ),
  "utf8",
);

test("moves credential values to Supabase Vault and clears plaintext", () => {
  assert.match(migration, /vault\.create_secret/);
  assert.match(migration, /SET secret_value = NULL/);
  assert.match(migration, /REVOKE ALL ON public\.credential_secrets FROM authenticated/);
});

test("supports owner-only password reveal and a separate encrypted TOTP seed", () => {
  assert.match(passwordManagerMigration, /totp_vault_secret_id uuid/);
  assert.match(passwordManagerMigration, /credential\.user_id = auth\.uid\(\)/);
  assert.match(passwordManagerMigration, /reveal_credential_secret/);
  assert.match(passwordManagerMigration, /COALESCE\(credential\.totp_vault_secret_id/);
  assert.match(passwordManagerMigration, /REVOKE ALL.*FROM PUBLIC, anon/i);
  assert.match(serverFunctions, /rpc\(["']reveal_credential_secret["']/);
  assert.doesNotMatch(serverFunctions, /decrypted_secrets/);
});

test("uses metadata-only RPCs instead of direct credential table access", () => {
  assert.doesNotMatch(serverFunctions, /\.from\(["']credential_secrets["']\)/);
  assert.match(serverFunctions, /rpc\(["']list_credential_secrets["']\)/);
  assert.doesNotMatch(
    migration.match(/list_credential_secrets[\s\S]*?\$\$;/)?.[0] ?? "",
    /secret_value/,
  );
});
