import test from "node:test";
import assert from "node:assert/strict";
import { PROVIDER_API_PRESETS } from "./provider-api-presets.ts";
import { openApiOperations } from "./openapi-connector.ts";

test("organization presets use fixed official origins and distinguish reads from writes", () => {
  for (const preset of PROVIDER_API_PRESETS) {
    const parsed = openApiOperations(preset.schema);
    assert.equal(parsed.endpoint, preset.endpoint);
    assert.equal(parsed.tools.length, 2);
    assert.equal(parsed.tools.filter((tool) => tool.annotations.readOnlyHint).length, 1);
    assert.doesNotMatch(JSON.stringify(preset.schema), /api_keys|chat\/|messages/);
  }
});
