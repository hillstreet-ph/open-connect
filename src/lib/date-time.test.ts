import test from "node:test";
import assert from "node:assert/strict";
import { formatDateTime, formatRelative } from "./date-time.ts";

test("formats a timestamp as a localized date and time", () => {
  const value = formatDateTime("2026-10-30T21:46:42Z");
  assert.notEqual(value, "—");
  assert.match(value, /2026/);
});

test("returns an em dash for missing or invalid timestamps", () => {
  for (const value of [null, undefined, "", "not a date"])
    assert.equal(formatDateTime(value as never), "—");
  for (const value of [null, undefined, "nope"]) assert.equal(formatRelative(value as never), "—");
});

test("relative ages collapse to human-readable buckets", () => {
  const now = Date.now();
  assert.equal(formatRelative(new Date(now - 5_000)), "just now");
  assert.match(formatRelative(new Date(now - 5 * 60_000)), /minute/);
  assert.match(formatRelative(new Date(now - 3 * 3600_000)), /hour/);
  assert.match(formatRelative(new Date(now - 2 * 86400_000)), /day/);
});
