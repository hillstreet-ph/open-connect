import assert from "node:assert/strict";
import test from "node:test";
import {
  NOTES_MAX_LENGTH,
  findCredentialNotes,
  resolveNotesForUpdate,
  withoutNotes,
} from "./credential-notes.ts";

test("withoutNotes removes note text and reports presence", () => {
  const listed = withoutNotes({ id: "a", name: "x", notes: "-----BEGIN PRIVATE KEY-----" });
  assert.equal("notes" in listed, false);
  assert.equal(listed.has_notes, true);
  assert.equal(JSON.stringify(listed).includes("PRIVATE KEY"), false);
});

test("withoutNotes treats empty and whitespace notes as absent", () => {
  assert.equal(withoutNotes({ id: "a", notes: null }).has_notes, false);
  assert.equal(withoutNotes({ id: "a", notes: "" }).has_notes, false);
  assert.equal(withoutNotes({ id: "a", notes: "  \n " }).has_notes, false);
});

test("resolveNotesForUpdate preserves stored notes when client did not load them", () => {
  assert.equal(resolveNotesForUpdate(undefined, "keep me"), "keep me");
  assert.equal(resolveNotesForUpdate(undefined, null), "");
});

test("resolveNotesForUpdate applies an explicit edit, including clearing", () => {
  assert.equal(resolveNotesForUpdate("new", "old"), "new");
  assert.equal(resolveNotesForUpdate("", "old"), "");
  assert.equal(resolveNotesForUpdate("x".repeat(5000), null).length, NOTES_MAX_LENGTH);
});

test("findCredentialNotes returns only the requested owned row", () => {
  const rows = [
    { id: "a", notes: "first" },
    { id: "b", notes: null },
  ];
  assert.equal(findCredentialNotes(rows, "a"), "first");
  assert.equal(findCredentialNotes(rows, "b"), "");
  assert.throws(() => findCredentialNotes(rows, "missing"), /not found or access denied/);
});
