import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildControlPlan,
  classifyRisk,
  isOpaqueCredentialReference,
  redactEvidence,
} from "./autonomous-control.ts";

describe("autonomous control policy", () => {
  it("allows read-only goals without approval", () => {
    assert.equal(classifyRisk("inspect Airtable connection"), "read");
    assert.equal(buildControlPlan("inspect Airtable connection").approvalRequired, false);
  });

  it("allows reversible configuration autonomously", () => {
    assert.equal(classifyRisk("configure Airtable connector", "staging"), "reversible_write");
  });

  it("protects credential and destructive operations", () => {
    assert.equal(classifyRisk("rotate Airtable token"), "protected");
    assert.equal(buildControlPlan("delete production database").approvalRequired, true);
  });

  it("accepts only opaque broker references", () => {
    assert.equal(isOpaqueCredentialReference("credential://airtable/kobeplay"), true);
    assert.equal(isOpaqueCredentialReference("pat_live_secret"), false);
  });

  it("redacts nested evidence", () => {
    assert.deepEqual(redactEvidence({ token: "secret", nested: { apiKey: "secret", ok: true } }), {
      token: "[REDACTED]",
      nested: { apiKey: "[REDACTED]", ok: true },
    });
  });
});
