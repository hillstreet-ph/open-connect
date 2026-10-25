import assert from "node:assert/strict";
import test from "node:test";
import {
  taskInput,
  templateInput,
  STARTER_TEMPLATES,
  validateOneTime,
  validTimezone,
  RECURRENCES,
} from "./operations.ts";
import { cronMatches, parseCron } from "./schedule-cron.ts";

test("task input rejects invalid status-adjacent fields, dates, and foreign IDs", () => {
  assert.equal(taskInput.parse({ title: "  Review  " }).title, "Review");
  for (const input of [
    { title: " " },
    { title: "a", priority: "danger" },
    { title: "a", projectId: "not-an-id" },
    { title: "a", dueAt: "tomorrow" },
  ])
    assert.equal(taskInput.safeParse(input).success, false);
});
test("templates have stable unique IDs and valid reusable fields", () => {
  assert.equal(new Set(STARTER_TEMPLATES.map((t) => t.id)).size, STARTER_TEMPLATES.length);
  for (const t of STARTER_TEMPLATES) templateInput.parse(t);
  assert.equal(templateInput.safeParse({ name: "", kind: "task", title: "a" }).success, false);
  assert.equal(templateInput.safeParse({ name: "a", kind: "script", title: "a" }).success, false);
});
test("one-time schedules reject past and invalid times", () => {
  const now = new Date("2026-10-26T00:00:00Z");
  assert.throws(() => validateOneTime("invalid", now), /future/);
  assert.throws(() => validateOneTime("2026-10-25T23:59:00Z", now), /future/);
  assert.equal(validateOneTime("2026-10-26T09:00:00+08:00", now), "2026-10-26T01:00:00.000Z");
  assert.equal(validTimezone("Asia/Manila"), "Asia/Manila");
  assert.throws(() => validTimezone("invalid"), /timezone/);
});
test("schedule presets are unique and cron uses standard calendar-day OR semantics", () => {
  assert.equal(new Set(RECURRENCES.map((r) => r.value)).size, RECURRENCES.length);
  for (const r of RECURRENCES) parseCron(r.value);
  assert.equal(cronMatches("0 9 1 * 1", new Date("2026-10-05T09:00:00Z")), true);
  assert.equal(cronMatches("0 9 1 * 1", new Date("2026-10-01T09:00:00Z")), true);
  assert.equal(cronMatches("0 9 1 * 1", new Date("2026-10-02T09:00:00Z")), false);
  assert.throws(() => parseCron("1- * * * *"));
  assert.throws(() => parseCron("1//2 * * * *"));
});
