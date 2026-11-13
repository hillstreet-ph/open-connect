import assert from "node:assert/strict";
import test from "node:test";
import { cronMatches, nextCronOccurrence, parseCron } from "./schedule-cron.ts";

test("cron parser validates five fields and supported syntax", () => {
  assert.deepEqual(parseCron("*/15 9-17 * * 1-5"), ["*/15", "9-17", "*", "*", "1-5"]);
  assert.throws(() => parseCron("every hour"), /five-field/);
  assert.throws(() => parseCron("99 * * * *"), /Cron fields/);
  assert.throws(() => parseCron(",1 * * * *"), /Cron fields/);
  assert.throws(() => parseCron("/5 * * * *"), /Cron fields/);
});

test("cron matching supports timezone-aware schedules", () => {
  assert.equal(
    cronMatches("0 9 * * 1-5", new Date("2026-10-05T13:00:00Z"), "America/New_York"),
    true,
  );
  assert.equal(
    cronMatches("0 9 * * 1-5", new Date("2026-10-05T14:00:00Z"), "America/New_York"),
    false,
  );
});

test("next cron occurrence starts strictly after the input", () => {
  assert.equal(
    nextCronOccurrence("*/15 * * * *", new Date("2026-10-05T10:07:43Z")).toISOString(),
    "2026-10-05T10:15:00.000Z",
  );
});
