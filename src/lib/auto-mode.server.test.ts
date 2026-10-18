import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { autoScopeKey, readAutoMode, writeAutoMode } from "./auto-mode.server.ts";
const key = { userId: "owner", projectId: null, workspaceId: null, organizationId: null };
function database() {
  const filters: Record<string, unknown> = {};
  let saved: Record<string, unknown> | null = null;
  let failure = false;
  const query = {
    select() {
      return this;
    },
    eq(k: string, v: unknown) {
      filters[k] = v;
      return this;
    },
    upsert(data: Record<string, unknown>) {
      saved = data;
      return this;
    },
    async maybeSingle() {
      return { data: saved, error: failure ? {} : null };
    },
    async single() {
      return { data: saved, error: failure ? {} : null };
    },
  };
  return {
    db: { from: () => query } as unknown as SupabaseClient,
    filters,
    saved: () => saved,
    fail: () => {
      failure = true;
    },
  };
}
test("scope prioritizes project, workspace, organization, then personal", () => {
  assert.equal(autoScopeKey(key), "personal");
  assert.equal(autoScopeKey({ ...key, organizationId: "org" }), "organization:org");
  assert.equal(
    autoScopeKey({ ...key, organizationId: "org", workspaceId: "work" }),
    "workspace:work",
  );
  assert.equal(
    autoScopeKey({ ...key, organizationId: "org", workspaceId: "work", projectId: "proj" }),
    "project:proj",
  );
});
test("defaults to enabled for owned context and persists off without changing approvals", async () => {
  const fixture = database();
  assert.equal((await readAutoMode(fixture.db, key)).enabled, true);
  assert.deepEqual(fixture.filters, { user_id: "owner", scope_key: "personal" });
  const state = await writeAutoMode(fixture.db, { ...key, projectId: "proj" }, false);
  assert.equal(fixture.saved()!["user_id"], "owner");
  assert.equal(fixture.saved()!["scope_key"], "project:proj");
  assert.equal(state.enabled, false);
  assert.equal(state.approval_policy, "host_and_provider_enforced");
  assert.equal((await readAutoMode(fixture.db, { ...key, projectId: "proj" })).discovery, false);
});
test("unavailable storage fails closed and rejects coercion of toggle values", async () => {
  const fixture = database();
  fixture.fail();
  const state = await readAutoMode(fixture.db, key);
  assert.equal(state.enabled, null);
  assert.equal(state.discovery, false);
  await assert.rejects(writeAutoMode(fixture.db, key, "true"), /boolean/);
  await assert.rejects(writeAutoMode(fixture.db, key, true), /could not be saved/);
});
