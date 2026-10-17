import assert from "node:assert/strict";
import test from "node:test";
import {
  adminAccess,
  manageResource,
  requireResourceManagement,
  resourceContent,
  resourceMetadata,
} from "./admin-management.server.ts";

const key = { userId: "owner", scopes: ["resources:write", "control:write", "secrets:read"] };
const id = "ab931f5d-bdee-4d32-bb98-5ad623987aba";
const revision = "2026-10-17T00:00:00.000Z";
const args = { id, expected_updated_at: revision };

test("writes require an admin, both scopes and a personal context", () => {
  requireResourceManagement(key, true);
  assert.throws(() => requireResourceManagement(key, false), /Admin/);
  for (const scopes of [[], ["control:write"], ["resources:write"]])
    assert.throws(() => requireResourceManagement({ ...key, scopes }, true), /required/);
  for (const boundary of ["organizationId", "workspaceId", "projectId"])
    assert.throws(
      () => requireResourceManagement({ ...key, [boundary]: "restricted" }, true),
      /personal/,
    );
  assert.equal(adminAccess(key, true).capabilities.resource_management, true);
  assert.equal(adminAccess(key, true).capabilities.credential_value_write_via_mcp, false);
});

test("metadata does not accept grants, owner changes, verification or publication", () => {
  const base = { name: "Workflow", slug: "workflow", resource_type: "toolkit" };
  assert.equal(resourceMetadata(base, true)["resource_type"], "toolkit");
  for (const field of ["owner_id", "verified", "published", "installation_config"])
    assert.throws(() => resourceMetadata({ ...base, [field]: true }, true), /Unsupported/);
  assert.throws(() => resourceMetadata({ ...base, slug: "../escape" }, true));
  assert.throws(() => resourceMetadata({ ...args }, false), /Supply/);
});

test("content is bounded text and rejects credentials and unsafe filenames", () => {
  assert.equal(resourceContent({ filename: "SKILL.md", content: "# Skill" }).bytes.length, 7);
  for (const filename of ["../SKILL.md", "key.pem", "package.zip", "script.js"])
    assert.throws(() => resourceContent({ filename, content: "content" }));
  for (const content of [
    "-----BEGIN PRIVATE KEY-----",
    "oc_live_abcdefghijklmnop",
    "a".repeat(262145),
    "text\0",
  ])
    assert.throws(() => resourceContent({ filename: "SKILL.md", content }));
  assert.throws(() => resourceContent({ filename: "tool.json", content: "broken json" }));
});

// This fixture models owner/revision filters and records actual attempted side effects.
function database(
  options: { owner?: string; verified?: boolean; conflict?: boolean; readRevision?: string } = {},
) {
  const row = {
    id,
    owner_id: options.owner ?? "owner",
    updated_at: options.readRevision ?? revision,
    verified: options.verified ?? false,
    published: false,
  };
  const writes: Record<string, unknown>[] = [];
  const uploads: string[] = [];
  const removed: string[] = [];
  const db = {
    from(table: string) {
      assert.equal(table, "resources");
      const filters: Record<string, unknown> = {};
      let update: Record<string, unknown> | undefined;
      return {
        select() {
          return this;
        },
        eq(field: string, value: unknown) {
          filters[field] = value;
          return this;
        },
        insert(value: Record<string, unknown>) {
          update = value;
          writes.push(value);
          return this;
        },
        update(value: Record<string, unknown>) {
          update = value;
          return this;
        },
        async single() {
          return { data: { ...update, id }, error: null };
        },
        async maybeSingle() {
          if (
            filters["owner_id"] !== row.owner_id ||
            filters["id"] !== id ||
            (update && (options.conflict || filters["updated_at"] !== row.updated_at))
          )
            return { data: null, error: null };
          if (update) writes.push(update);
          return { data: { ...row, ...update }, error: null };
        },
      };
    },
    storage: {
      from(bucket: string) {
        assert.equal(bucket, "resource-packages");
        return {
          async upload(path: string) {
            uploads.push(path);
            return { error: null };
          },
          async remove(paths: string[]) {
            removed.push(...paths);
            return { error: null };
          },
        };
      },
    },
  };
  return { db: db as unknown as Parameters<typeof manageResource>[0], writes, uploads, removed };
}

test("creates private owned drafts and rejects cross-owner mutations", async () => {
  const f = database();
  await manageResource(f.db, key, true, "create_resource", {
    name: "Draft",
    slug: "draft",
    resource_type: "skill",
  });
  assert.equal(f.writes[0]!["owner_id"], "owner");
  assert.equal(f.writes[0]!["published"], false);
  assert.equal(f.writes[0]!["verified"], false);
  const foreign = database({ owner: "other" });
  await assert.rejects(
    manageResource(foreign.db, key, true, "update_resource", { ...args, name: "Changed" }),
    /Owned resource not found/,
  );
  assert.equal(foreign.writes.length, 0);
});

test("publishing requires verification, explicit confirmation and matching revision", async () => {
  await assert.rejects(
    manageResource(database().db, key, true, "set_resource_publication", {
      ...args,
      published: true,
      confirm: true,
    }),
    /review/,
  );
  const f = database({ verified: true });
  await assert.rejects(
    manageResource(f.db, key, true, "set_resource_publication", { ...args, published: true }),
    /confirm/,
  );
  await manageResource(f.db, key, true, "set_resource_publication", {
    ...args,
    published: true,
    confirm: true,
  });
  assert.equal(f.writes[0]!["published"], true);
  const stale = database({ verified: true, conflict: true });
  await assert.rejects(
    manageResource(stale.db, key, true, "set_resource_publication", {
      ...args,
      published: true,
      confirm: true,
    }),
    /conflicted/,
  );
  assert.equal(stale.writes.length, 0);
});

test("editing resets review; failed compare-and-set cleans up new upload only", async () => {
  const f = database({ verified: true });
  await manageResource(f.db, key, true, "update_resource", { ...args, name: "Changed" });
  assert.equal(f.writes[0]!["verified"], false);
  assert.equal(f.writes[0]!["published"], false);
  const conflict = database({ conflict: true });
  await assert.rejects(
    manageResource(conflict.db, key, true, "upload_resource_content", {
      ...args,
      filename: "SKILL.md",
      content: "# Skill",
    }),
    /conflicted/,
  );
  assert.equal(conflict.uploads.length, 1);
  assert.deepEqual(conflict.removed, conflict.uploads);
  assert.equal(conflict.writes.length, 0);
  const stale = database({ readRevision: "2026-10-17T01:00:00.000Z" });
  await assert.rejects(
    manageResource(stale.db, key, true, "upload_resource_content", {
      ...args,
      filename: "SKILL.md",
      content: "# Skill",
    }),
    /changed/,
  );
  assert.equal(stale.uploads.length, 0);
});
