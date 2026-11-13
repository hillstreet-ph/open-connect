import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildAdaptivePlan,
  buildControlPlan,
  buildLearningRecord,
  classifyRisk,
  isOpaqueCredentialReference,
  rankCapabilities,
  discoverPluginCapabilities,
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
    assert.deepEqual(
      redactEvidence({
        token: "secret",
        nested: { apiKey: "secret", ok: true },
      }),
      {
        token: "[REDACTED]",
        nested: { apiKey: "[REDACTED]", ok: true },
      },
    );
  });

  it("ranks the smallest relevant capability set", () => {
    const ranked = rankCapabilities("scrape a website with the TinyFish browser agent", [
      {
        slug: "tinyfish-agent-browser",
        name: "TinyFish Agent Browser",
        description: "Cloud browser agent for website extraction",
        resourceType: "tool",
      },
      {
        slug: "github",
        name: "GitHub",
        description: "Repository automation",
        resourceType: "app",
      },
    ]);
    assert.equal(ranked[0]?.slug, "tinyfish-agent-browser");
    assert.equal(ranked.length, 1);
  });

  it("creates a non-executable draft when no capability matches", () => {
    const plan = buildAdaptivePlan("translate a satellite telemetry format", "development", []);
    assert.equal(plan.missingCapability, true);
    assert.equal(plan.fallback?.state, "draft");
    assert.equal(plan.fallback?.executable, false);
  });

  it("turns outcomes into redacted reusable memory", () => {
    const record = buildLearningRecord({
      goal: "verify deployment",
      status: "failed",
      summary: "Health check timed out",
      evidence: { token: "do-not-store", status: 504 },
    });
    assert.equal(record.importance, 4);
    assert.deepEqual(record.evidence, { token: "[REDACTED]", status: 504 });
  });
});

describe("capability discovery relevance", () => {
  const candidates = [
    {
      slug: "browser",
      name: "Browser",
      description: "Website extraction",
      resourceType: "skill",
    },
    {
      slug: "github-issue",
      name: "GitHub issue",
      description: "Create an issue in a connected repository",
      resourceType: "tool",
    },
    {
      slug: "terminal",
      name: "Terminal",
      description: "Run sandbox commands",
      resourceType: "tool",
    },
  ];
  it("ignores filler words that previously matched unrelated tools", () => {
    assert.deepEqual(
      rankCapabilities("please find tools for browsing websites", candidates).map((c) => c.slug),
      ["browser"],
    );
    assert.deepEqual(rankCapabilities("create tools for all my needs", candidates), []);
  });
  it("matches common runtime aliases and resource categories", () => {
    assert.equal(rankCapabilities("shell", candidates)[0]?.slug, "terminal");
    assert.equal(
      rankCapabilities("skills", [{ ...candidates[0]!, resourceType: "skills" }])[0]?.slug,
      "browser",
    );
  });
  it("does not lose a relevant match because a query includes extra words", () => {
    assert.equal(
      rankCapabilities("browser for previously unknown workflow", candidates)[0]?.slug,
      "browser",
    );
  });
});

describe("plugin capability discovery", () => {
  const candidates = [
    { slug: "browser_tool", name: "Browser action", resourceType: "function" },
    { slug: "browser-kit", name: "Browser toolkit", resourceType: "toolkit" },
    {
      slug: "browser-app",
      name: "Browser extension",
      resourceType: "plugin",
      installationType: "claude-plugin",
    },
    { slug: "browser-skill", name: "Browser skill", resourceType: "skill" },
  ];
  const platform = new Set(["browser_tool"]);
  it("keeps executable functions distinct from package metadata", () => {
    const results = discoverPluginCapabilities("browser", candidates, platform);
    const action = results.find((item) => item.slug === "browser_tool")!;
    assert.equal(action.source, "platform");
    assert.equal(action.execution_status, "scope_authorized_function");
    const skill = results.find((item) => item.slug === "browser-skill")!;
    assert.equal(skill.execution_status, "catalog_only");
    assert.equal(skill.discovery_tool, "fetch");
    assert.deepEqual(skill.discovery_arguments, { id: "browser-skill" });
  });
  it("supports action, app, extension, toolkit and skill filters", () => {
    for (const type of ["action", "function", "app", "extension", "toolkit", "skill"]) {
      assert.equal(discoverPluginCapabilities("browser", candidates, platform, type).length, 1);
    }
    assert.throws(() => discoverPluginCapabilities("browser", candidates, platform, "unknown"));
    assert.deepEqual(discoverPluginCapabilities("unmatched", candidates, platform), []);
  });
});
