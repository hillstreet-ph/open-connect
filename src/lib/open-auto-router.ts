/**
 * Open-Auto: free-first Fireworks AI routing for the open-connect gateway.
 *
 * Policies:
 * - Tiered candidate order: free models first, paid models as backup,
 *   subscription capacity last. Unknown models default to paid so a model is
 *   only treated as free when it is explicitly recognized as free.
 * - Automatic rotation: on rate limits (429), timeouts (408/504), or server
 *   errors (5xx), execution rotates to the next candidate and continues
 *   without stopping. Authentication errors never rotate.
 * - Hierarchical delegation: an apex orchestrator fans independent subtasks
 *   out to parallel workers (capped), then results are merged.
 *
 * The Fireworks API key is read only from the FIREWORKS_API_KEY environment
 * variable; it is never accepted from chat or written to any file.
 */

export type OpenAutoTier = "free" | "paid" | "subscription";

export const OPEN_AUTO_TIER_ORDER: readonly OpenAutoTier[] = ["free", "paid", "subscription"];

export interface OpenAutoModel {
  id: string;
  capabilities?: string[];
}

export interface OpenAutoTierConfig {
  freeModelPatterns: RegExp[];
  subscriptionModelPatterns: RegExp[];
}

const DEFAULT_FREE_MODEL_PATTERNS = [/glimmer/i, /free/i, /onboarding/i];
const DEFAULT_SUBSCRIPTION_MODEL_PATTERNS = [/dedicated/i, /reserved/i, /subscription/i];

/** A model is free only when explicitly recognized as free; unknown models are paid. */
export function classifyOpenAutoTier(
  modelId: string,
  config: OpenAutoTierConfig = {
    freeModelPatterns: DEFAULT_FREE_MODEL_PATTERNS,
    subscriptionModelPatterns: DEFAULT_SUBSCRIPTION_MODEL_PATTERNS,
  },
): OpenAutoTier {
  if (config.freeModelPatterns.some((pattern) => pattern.test(modelId))) {
    return "free";
  }
  if (config.subscriptionModelPatterns.some((pattern) => pattern.test(modelId))) {
    return "subscription";
  }
  return "paid";
}

/** Order candidates free first, then paid, then subscription; stable within tiers. */
export function orderOpenAutoCandidates(models: OpenAutoModel[]): OpenAutoModel[] {
  const rank = (model: OpenAutoModel) =>
    OPEN_AUTO_TIER_ORDER.indexOf(classifyOpenAutoTier(model.id));
  return [...models].sort((a, b) => rank(a) - rank(b));
}

/** Rate limits, timeouts, and server errors rotate to the next candidate. */
export function isOpenAutoRotatableStatus(status: number): boolean {
  return status === 429 || status === 408 || status === 504 || status >= 500;
}

function matchesCapability(model: OpenAutoModel, capability: string | undefined): boolean {
  if (!capability) return true;
  return (model.capabilities ?? []).includes(capability);
}

export interface OpenAutoRotationEvent {
  from: string;
  to: string;
  reason: string;
}

export interface OpenAutoChatRequest {
  messages: Array<Record<string, unknown>>;
  tools?: unknown[];
  temperature?: number;
  max_tokens?: number;
}

/** Injectable chat call so tests run without network access or live keys. */
export type OpenAutoChatFn = (model: string, request: OpenAutoChatRequest) => Promise<unknown>;

export class OpenAutoRotationError extends Error {
  rotations: OpenAutoRotationEvent[];

  constructor(message: string, rotations: OpenAutoRotationEvent[]) {
    super(message);
    this.name = "OpenAutoRotationError";
    this.rotations = rotations;
  }
}

/**
 * Route a chat request through the ordered candidates, rotating
 * automatically past rotatable failures. Authentication and client errors
 * are surfaced immediately because rotation cannot fix them.
 */
export async function routeOpenAutoChat(options: {
  candidates: OpenAutoModel[];
  request: OpenAutoChatRequest;
  chat: OpenAutoChatFn;
  capability?: string;
  onRotation?: (event: OpenAutoRotationEvent) => void;
}): Promise<{ model: string; result: unknown }> {
  const pool = options.candidates.filter((model) => matchesCapability(model, options.capability));
  const ordered = orderOpenAutoCandidates(pool);
  if (ordered.length === 0) {
    throw new OpenAutoRotationError("No candidate models available for this request.", []);
  }
  const rotations: OpenAutoRotationEvent[] = [];
  let lastError: unknown;
  for (let index = 0; index < ordered.length; index += 1) {
    const model = ordered[index]!;
    try {
      const result = await options.chat(model.id, options.request);
      return { model: model.id, result };
    } catch (error) {
      lastError = error;
      const status = (error as { status?: number })?.status;
      const next = ordered[index + 1];
      if (status !== undefined && isOpenAutoRotatableStatus(status) && next) {
        const event = { from: model.id, to: next.id, reason: `HTTP ${status}` };
        rotations.push(event);
        options.onRotation?.(event);
        continue;
      }
      break;
    }
  }
  throw lastError instanceof Error
    ? new OpenAutoRotationError(lastError.message, rotations)
    : new OpenAutoRotationError(String(lastError), rotations);
}

export const OPEN_AUTO_MAX_CONCURRENCY = 8;

export interface OpenAutoSubtaskResult<T> {
  index: number;
  ok: boolean;
  value?: T;
  error?: string;
}

/**
 * Hierarchical delegation: run independent subtasks in parallel, capped at
 * OPEN_AUTO_MAX_CONCURRENCY concurrent workers, and never let one failed
 * worker sink the batch. Synchronous worker throws are captured as
 * individual failures so they cannot take down the whole batch.
 */
export async function runOpenAutoWorkers<T>(
  subtasks: Array<() => Promise<T>>,
  concurrency = OPEN_AUTO_MAX_CONCURRENCY,
): Promise<OpenAutoSubtaskResult<T>[]> {
  const limit = Math.max(1, Math.min(OPEN_AUTO_MAX_CONCURRENCY, Math.floor(concurrency) || 1));
  const results: OpenAutoSubtaskResult<T>[] = [];
  for (let start = 0; start < subtasks.length; start += limit) {
    const batch = subtasks.slice(start, start + limit);
    const settled = await Promise.allSettled(batch.map(async (run) => run()));
    settled.forEach((outcome, offset) => {
      if (outcome.status === "fulfilled") {
        results.push({ index: start + offset, ok: true, value: outcome.value });
        return;
      }
      const reason =
        outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
      results.push({ index: start + offset, ok: false, error: reason.slice(0, 300) });
    });
  }
  return results;
}
