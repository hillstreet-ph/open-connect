import { randomUUID } from "crypto";

export type ControlRisk = "read" | "reversible_write" | "protected";

export type ControlPlanStep = {
  id: string;
  capability: string;
  target: string;
  risk: ControlRisk;
  approvalRequired: boolean;
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
