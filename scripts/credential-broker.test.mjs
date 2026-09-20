import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { resolveProfile, resolveProfileWithAdapter } from "./credential-broker.mjs";

test("reports missing credentials without exposing values", () => {
  const result = resolveProfile("openai-agent", {});
  assert.equal(result.ready, false);
  assert.deepEqual(result.missing, ["OPENAI_API_KEY"]);
  assert.equal(JSON.stringify(result).includes("secret-value"), false);
});

test("selects one supported alias from an any-of group", () => {
  const result = resolveProfile("github-release", { GITHUB_TOKEN: "secret-value" });
  assert.equal(result.ready, true);
  assert.deepEqual(result.selected, ["GITHUB_TOKEN"]);
  assert.equal(JSON.stringify(result).includes("secret-value"), false);
});

test("injects only profile-scoped names", () => {
  const result = resolveProfile("open-connect-plugin", {
    OPEN_CONNECT_API_KEY: "secret-value",
    OPENAI_API_KEY: "other-secret",
  });
  assert.deepEqual(result.selected, ["OPEN_CONNECT_API_KEY"]);
});

test("resolves a missing value through an opaque adapter without exposing it", () => {
  const directory = mkdtempSync(join(tmpdir(), "oc-resolver-"));
  const adapter = join(directory, "resolver.mjs");
  writeFileSync(
    adapter,
    '#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({value:"adapter-secret"}));\n',
    { mode: 0o700 },
  );
  chmodSync(adapter, 0o700);
  const result = resolveProfileWithAdapter("open-connect-plugin", {
    OPEN_CONNECT_CREDENTIAL_RESOLVER: adapter,
  });
  assert.equal(result.ready, true);
  assert.deepEqual(result.selected, ["OPEN_CONNECT_API_KEY"]);
  assert.equal(JSON.stringify(result).includes("adapter-secret"), false);
});
