import test from "node:test";
import assert from "node:assert/strict";
import {
  describeAgentHelperToolResult,
  helperPriority,
  helperProjectId,
  helperScheduleTiming,
  helperText,
  parseAgentHelperArguments,
} from "./agent-helper-policy.ts";

test("Agent-Helper accepts only JSON object tool arguments", () => {
  assert.deepEqual(parseAgentHelperArguments('{"title":"Check setup"}'), {
    title: "Check setup",
  });
  assert.throws(() => parseAgentHelperArguments("not json"), /invalid arguments/);
  assert.throws(() => parseAgentHelperArguments("[]"), /invalid arguments/);
});

test("Agent-Helper text input is trimmed and bounded", () => {
  assert.equal(
    helperText("  Install a verified skill  ", "Action", 32),
    "Install a verified skill",
  );
  assert.throws(() => helperText(" ", "Action", 32), /required/);
  assert.throws(() => helperText("too long", "Action", 3), /too long/);
});

test("Agent-Helper project scope accepts only UUID project ids", () => {
  assert.equal(
    helperProjectId("3ac8f119-5446-46cf-8df3-5fa90c28551c"),
    "3ac8f119-5446-46cf-8df3-5fa90c28551c",
  );
  assert.equal(helperProjectId(undefined), null);
  assert.throws(() => helperProjectId("another-team-project"), /Choose a project/);
});

test("Agent-Helper schedule arguments require valid timing and timezone", () => {
  assert.deepEqual(helperScheduleTiming({ cronExpr: "0 9 * * 1", timezone: "Asia/Manila" }), {
    cronExpr: "0 9 * * 1",
    runAt: null,
    timezone: "Asia/Manila",
  });
  assert.throws(() => helperScheduleTiming({}), /run time or cron/);
  assert.throws(() => helperScheduleTiming({ cronExpr: "daily" }), /five-field cron/);
  assert.throws(() => helperScheduleTiming({ runAt: "not a date" }), /valid date/);
  assert.throws(
    () => helperScheduleTiming({ cronExpr: "0 9 * * 1", timezone: "Mars/Olympus" }),
    /valid IANA/,
  );
});

test("Agent-Helper priorities are from the supported task set", () => {
  assert.equal(helperPriority("urgent"), "urgent");
  assert.equal(helperPriority(undefined), "medium");
  assert.throws(() => helperPriority("critical"), /Choose low, medium, high, or urgent/);
});

test("Agent-Helper gives a verified fallback after a completed write", () => {
  assert.match(
    describeAgentHelperToolResult("create_task", {
      created: true,
      task: { title: "Review access" },
    }),
    /Created the task “Review access”/,
  );
  assert.match(
    describeAgentHelperToolResult("create_schedule", {
      saved: true,
      schedule: { name: "Monday review" },
      execution: "not_available",
    }),
    /does not currently run scheduled jobs/,
  );
  assert.match(
    describeAgentHelperToolResult("create_task", { error: "Project unavailable." }),
    /No change was made/,
  );
});
