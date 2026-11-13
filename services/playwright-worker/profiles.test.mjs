import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, stat, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ownerProfile } from "./profiles.mjs";

test("persistent profiles are stable, private and isolated even for path-like owner names", async () => {
  const root = await mkdtemp(join(tmpdir(), "oc-profile-test-"));
  try {
    const a = await ownerProfile(root, "../owner-a");
    const b = await ownerProfile(root, "owner-b");
    assert.notEqual(a, b);
    assert.ok(a.startsWith(root + "/"));
    assert.equal((await stat(a)).mode & 0o777, 0o700);
    await writeFile(join(a, "state"), "owned-state");
    const resumed = await ownerProfile(root, "../owner-a");
    assert.equal(await readFile(join(resumed, "state"), "utf8"), "owned-state");
    assert.equal(await ownerProfile(undefined, "owner-a"), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
