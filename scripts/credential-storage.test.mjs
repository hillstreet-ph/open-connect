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
const connectionBrokerMigration = readFileSync(
  new URL(
    "../supabase/migrations/20260924030000_connection_credential_broker.sql",
    import.meta.url,
  ),
  "utf8",
);
const customMcpBroker = readFileSync(
  new URL("../src/lib/custom-mcp.server.ts", import.meta.url),
  "utf8",
);
const credentialRoute = readFileSync(
  new URL("../src/routes/_authenticated/secrets.tsx", import.meta.url),
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

test("resolves connection credentials only through the service-role broker", () => {
  assert.match(connectionBrokerMigration, /auth\.role\(\).*service_role/s);
  assert.match(connectionBrokerMigration, /credential\.user_id = p_user_id/);
  assert.match(connectionBrokerMigration, /REVOKE ALL.*FROM PUBLIC, anon, authenticated/s);
  assert.match(connectionBrokerMigration, /GRANT EXECUTE.*TO service_role/s);
  assert.match(customMcpBroker, /rpc\(["']resolve_connection_credential["']/);
  assert.doesNotMatch(customMcpBroker, /decrypted_secrets/);
  assert.doesNotMatch(customMcpBroker, /\.schema\(["']vault["']\)/);
});

test("requires explicit confirmation before permanently deleting Vault entries", () => {
  assert.match(credentialRoute, /Delete credential permanently\?/);
  assert.match(credentialRoute, /Delete permanently/);
  assert.match(credentialRoute, /setPendingDelete\(\{ id: row\.id, name: row\.name \}\)/);
  assert.match(credentialRoute, /Copy 2FA code for/);
  assert.match(credentialRoute, /Copy credential value for/);
});

test("credential manager uses type-aware fields and full reveal controls", () => {
  assert.match(credentialRoute, /TYPE_DETAILS/);
  assert.match(credentialRoute, /Search credentials/);
  assert.match(credentialRoute, /All types/);
  assert.match(credentialRoute, /This is the exact value stored in Vault/);
  assert.match(credentialRoute, /Hide credential value for/);
  assert.match(serverFunctions, /API keys and tokens cannot contain spaces or sentences/);
  assert.doesNotMatch(credentialRoute, />Scopes</);
  assert.doesNotMatch(credentialRoute, /SECRET_SCOPES|toggleScope/);
  assert.match(serverFunctions, /p_scopes: \[\]/);
});
