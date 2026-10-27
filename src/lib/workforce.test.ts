import test from "node:test";
import assert from "node:assert/strict";
import { workforceConfig, workforceToolArgs, workforceInstructions } from "./workforce.ts";
import { WORKFORCE_TEMPLATES } from "./workforce.templates.ts";
test("templates preserve engineering roles and use stable unique identities without fictional launches", () => {
  assert.equal(WORKFORCE_TEMPLATES.length, 17);
  assert.equal(new Set(WORKFORCE_TEMPLATES.map((t) => t.slug)).size, 17);
  const engineers = WORKFORCE_TEMPLATES.filter((t) => t.config.department === "engineering");
  assert.equal(engineers.length, 8);
  for (const role of ["Software Architect", "Developer", "QA Reviewer"])
    assert.ok(engineers.some((t) => t.config.role === role));
  assert.ok(
    WORKFORCE_TEMPLATES.every(
      (t) => t.config.chatgptUrl === null && t.config.model === "auto-free",
    ),
  );
});
test("capabilities cannot be broadened by a model or a different project", () => {
  const config = workforceConfig.parse({
    ...WORKFORCE_TEMPLATES[0]!.config,
    tools: ["create_task", "list_connectors"],
  });
  assert.throws(() => workforceToolArgs(config, null, "delete_database", {}), /not granted/);
  assert.throws(
    () => workforceToolArgs(config, "project-a", "create_task", { projectId: "project-b" }),
    /mismatch/,
  );
  assert.throws(() => workforceToolArgs(config, "project-a", "list_connectors", {}), /personal/);
  assert.deepEqual(workforceToolArgs(config, "project-a", "create_task", { title: "Test" }), {
    title: "Test",
    projectId: "project-a",
  });
  assert.throws(
    () => workforceToolArgs(config, null, "create_task", { projectId: "other" }),
    /project specialist/,
  );
});
test("invalid tools, secret-like instructions and invented host launch links are rejected or redacted", () => {
  assert.equal(
    workforceConfig.safeParse({ ...WORKFORCE_TEMPLATES[0]!.config, tools: ["shell"] }).success,
    false,
  );
  assert.equal(
    workforceConfig.safeParse({
      ...WORKFORCE_TEMPLATES[0]!.config,
      chatgptUrl: "https://evil.example/g/agent",
    }).success,
    false,
  );
  assert.ok(
    !workforceInstructions({
      ...WORKFORCE_TEMPLATES[0]!.config,
      instructions: "api_key=private-fixture-value",
    }).includes("private-fixture-value"),
  );
});
