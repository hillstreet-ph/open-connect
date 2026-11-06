/**
 * Open-Auto Fireworks AI routing.
 *
 * Policies:
 * - Free models first, paid models as backup, subscription capacity last.
 * - Automatic rotation to the next available model when rate limits are hit.
 * - Real-time catalog discovery: parse the Fireworks /v1/models response, so
 *   newly released models are picked up without configuration changes.
 * - Capability-aware selection (vision, tools, reasoning) for agentic work.
 */

export type FireworksTier = "free" | "paid" | "subscription";

export type FireworksModel = {
  id: string;
  tier: FireworksTier;
  capabilities: string[];
};

// Models covered by free-tier usage or active Fireworks promotions, such as
// the free LoRA SFT promotion on Muse Glimmer 30B through 2026-12-01.
export const FIREWORKS_FREE_MODEL_IDS: ReadonlySet<string> = new Set([
  "accounts/fireworks/models/muse-glimmer-30b",
  "accounts/fireworks/models/muse-glimmer-30b-instruct",
]);

const SUBSCRIPTION_HINTS = ["dedicated", "reserved", "subscription"];

function normalizeFireworksId(id: string): string {
  return id.trim().toLowerCase();
}

/** Classify a Fireworks model id into the free / paid / subscription tiers. */
export function classifyFireworksModel(id: string): FireworksTier {
  const model = normalizeFireworksId(id);
  if (model.endsWith(":free") || FIREWORKS_FREE_MODEL_IDS.has(model)) return "free";
  if (SUBSCRIPTION_HINTS.some((hint) => model.includes(hint))) return "subscription";
  return "paid";
}

/** Capability detection so agentic tasks route to capable models. */
export function fireworksCapabilities(id: string): string[] {
  const model = normalizeFireworksId(id);
  const capabilities = ["tools", "skills"];
  if (model.includes("vision") || model.includes("omni")) capabilities.push("vision");
  if (model.includes("reason") || model.includes("think")) capabilities.push("reasoning");
  if (model.includes("coder") || model.includes("code")) capabilities.push("code");
  return capabilities;
}

/** Parse a Fireworks GET /v1/models response into tiered, capable models. */
export function fireworksModelsFromCatalog(payload: unknown): FireworksModel[] {
  if (!payload || typeof payload !== "object") return [];
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  const seen = new Set<string>();
  const models: FireworksModel[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const id = (item as { id?: unknown }).id;
    if (typeof id !== "string" || !id.trim()) continue;
    const normalized = normalizeFireworksId(id);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    models.push({ id, tier: classifyFireworksModel(id), capabilities: fireworksCapabilities(id) });
  }
  return models;
}

const TIER_ORDER: Record<FireworksTier, number> = { free: 0, paid: 1, subscription: 2 };

/** Order candidates free first, then paid, then subscription; stable per tier. */
export function orderFireworksModels(models: FireworksModel[]): FireworksModel[] {
  return [...models].sort(
    (left, right) =>
      TIER_ORDER[left.tier] - TIER_ORDER[right.tier] || left.id.localeCompare(right.id),
  );
}

/** A Fireworks response is rotatable when it reports a rate limit or capacity issue. */
export function isFireworksRotationError(status: number): boolean {
  return status === 429 || status === 503;
}

/** Rotate past failed candidates without ever falling back to paid while free remains. */
export function nextFireworksCandidate(
  models: FireworksModel[],
  failed: ReadonlySet<string>,
): FireworksModel | null {
  const ordered = orderFireworksModels(models.filter((model) => !failed.has(model.id)));
  return ordered[0] ?? null;
}

/** Pick the first free model that exposes the capability a task needs. */
export function selectFireworksModelForTask(
  models: FireworksModel[],
  task: string,
): FireworksModel | null {
  const capability = task.trim().toLowerCase();
  const ordered = orderFireworksModels(models);
  return (
    ordered.find((model) => capability === "" || model.capabilities.includes(capability)) ?? null
  );
}
