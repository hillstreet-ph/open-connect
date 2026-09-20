import { randomUUID } from "crypto";

export type ControlRisk = "read" | "reversible_write" | "protected";

export type ControlPlanStep = {
  id: string;
  capability: string;
  target: string;
  risk: ControlRisk;
  approvalRequired: boolean;
};

export type CapabilityCandidate = {
  slug: string;
  name: string;
  description?: string | null;
  resourceType: string;
  installationType?: string | null;
};

export type RankedCapability = CapabilityCandidate & {
  score: number;
  matchedTerms: string[];
};

const PROTECTED_PATTERNS = [
  /delete|destroy|purge|revoke|rotate/i,
  /credential|secret|password|token/i,
  /permission|role|owner|admin|escalat/i,
  /dns|domain|certificate|volume|storage|database/i,
  /purchase|billing|spend|payment/i,
  /publish|public release/i,
];

const WRITE_PATTERNS = [
  /\b(install|configure|connect|deploy|create|update|sync|write|enable|restart)\b/i,
];

export function classifyRisk(text: string, environment = "production"): ControlRisk {
  if (PROTECTED_PATTERNS.some((pattern) => pattern.test(text))) return "protected";
  if (WRITE_PATTERNS.some((pattern) => pattern.test(text))) {
    return environment === "production" && /deploy|restart/i.test(text)
      ? "protected"
      : "reversible_write";
  }
  return "read";
}

export function buildControlPlan(goal: string, environment = "production") {
  const normalized = goal.trim();
  const risk = classifyRisk(normalized, environment);
  const steps: ControlPlanStep[] = [
    {
      id: "discover",
      capability: "connections.inspect",
      target: "open-connect",
      risk: "read",
      approvalRequired: false,
    },
    {
      id: "execute",
      capability: risk === "read" ? "resources.inspect" : "control.execute",
      target: normalized || "unspecified-goal",
      risk,
      approvalRequired: risk === "protected",
    },
    {
      id: "verify",
      capability: "control.verify",
      target: normalized || "unspecified-goal",
      risk: "read",
      approvalRequired: false,
    },
  ];
  return {
    id: randomUUID(),
    goal: normalized,
    environment,
    autonomous: true,
    steps,
    approvalRequired: steps.some((step) => step.approvalRequired),
    maxRepairAttempts: 3,
  };
}

function terms(value: string): string[] {
  return [
    ...new Set(
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .split(" ")
        .filter((term) => term.length > 2),
    ),
  ];
}

export function rankCapabilities(
  goal: string,
  candidates: CapabilityCandidate[],
  limit = 5,
): RankedCapability[] {
  const goalTerms = terms(goal);
  return candidates
    .map((candidate) => {
      const nameTerms = new Set(terms(`${candidate.slug} ${candidate.name}`));
      const descriptionTerms = new Set(terms(candidate.description ?? ""));
      const matchedTerms = goalTerms.filter(
        (term) => nameTerms.has(term) || descriptionTerms.has(term),
      );
      const score = matchedTerms.reduce((total, term) => total + (nameTerms.has(term) ? 3 : 1), 0);
      return { ...candidate, score, matchedTerms };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug))
    .slice(0, Math.min(10, Math.max(1, limit)));
}

export function buildAdaptivePlan(
  goal: string,
  environment: string,
  candidates: CapabilityCandidate[],
) {
  const base = buildControlPlan(goal, environment);
  const capabilities = rankCapabilities(goal, candidates);
  const missingCapability = capabilities.length === 0;
  return {
    ...base,
    capabilities,
    missingCapability,
    fallback: missingCapability
      ? {
          action: "create_capability_draft",
          state: "draft",
          executable: false,
          reason: "No approved catalog capability matched the goal.",
        }
      : null,
    learning: {
      captureOutcome: true,
      writeMemory: true,
      promoteToKnowledgeAfterSuccesses: 3,
      automaticCodeMutation: false,
    },
  };
}

export function buildLearningRecord(input: {
  goal: string;
  status: "succeeded" | "failed" | "blocked";
  summary: string;
  capabilitySlugs?: string[];
  evidence?: unknown;
}) {
  return {
    title: `Agent outcome: ${input.goal}`.slice(0, 200),
    content: input.summary.trim().slice(0, 50_000),
    memoryType: input.status === "succeeded" ? "summary" : "decision",
    importance: input.status === "succeeded" ? 3 : 4,
    tags: ["autonomous-agent", input.status, ...(input.capabilitySlugs ?? [])].slice(0, 20),
    evidence: redactEvidence(input.evidence ?? {}),
  };
}

export function isOpaqueCredentialReference(value: string): boolean {
  return /^credential:\/\/[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/i.test(value);
}

export function redactEvidence(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactEvidence);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      /secret|token|password|credential_value|api.?key/i.test(key)
        ? "[REDACTED]"
        : redactEvidence(item),
    ]),
  );
}
