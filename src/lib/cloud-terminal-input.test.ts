import assert from "node:assert/strict";
import test from "node:test";
import { terminalEditorField, terminalArgumentsWithText } from "./cloud-terminal-input.ts";

test("terminal editor only offers known execution tools with explicit string fields", () => {
  assert.equal(
    terminalEditorField("run_command", '{"properties":{"command":{"type":"string"}}}'),
    "command",
  );
  assert.equal(
    terminalEditorField("execute_command", '{"properties":{"cmd":{"type":"string"}}}'),
    "cmd",
  );
  assert.equal(
    terminalEditorField("run_code", '{"properties":{"code":{"type":"string"}}}'),
    "code",
  );
  assert.equal(
    terminalEditorField("delete_everything", '{"properties":{"command":{"type":"string"}}}'),
    null,
  );
  assert.equal(terminalEditorField("run_code", '{"properties":{"code":{"type":"array"}}}'), null);
  assert.equal(terminalEditorField("run_code", "{broken"), null);
});

test("editing command preserves execution target and rejects invalid arguments", () => {
  assert.deepEqual(
    JSON.parse(
      terminalArgumentsWithText(
        '{"sandbox_id":"owned-123","language":"python"}',
        "code",
        'print("hi")',
      ),
    ),
    {
      sandbox_id: "owned-123",
      language: "python",
      code: 'print("hi")',
    },
  );
  assert.throws(() => terminalArgumentsWithText("[]", "code", "x"), /JSON object/);
  assert.throws(() => terminalArgumentsWithText("{", "code", "x"));
});
