/**
 * Open-Auto router — needs-based, free-first model routing for the Open-Connect gateway.
 *
 * Execution follows the Open-Auto pyramid: an orchestrator orders candidate
 * routes by cost tier (free first, then paid, then subscription), fans
 * independent subtasks out to parallel workers, and merges their results.
 * Paid and subscription capacity therefore act purely as backups.
 */

export type OpenAutoTier = "free" | "paid" | "subscription";

export type OpenAutoRoute<T extends { name: string }> = {
  upstream: T;
  model: string;
  tier: OpenAutoTier;
};

const TIER_RANK: Record<OpenAutoTier, number> = {
  free: 0,
  paid: 1,
  subscription: 2,
};

/** Classify a model id into an Open-Auto cost tier. */
export function openAutoTier(model: string): OpenAutoTier {
  const id = (model || "").trim().toLowerCase();
  if (id.startsWith("subscription/")) return "subscription";
  if (id === "openrouter/free" || id.endsWith(":free") || id.endsWith("/free")) return "free";
  return "paid";
}

/** Order routes free-first; stable within a tier so auto-detected catalogs keep provider order. */
export function orderOpenAutoRoutes<T extends { name: string }>(
  routes: Array<{ upstream: T; model: string }>,
): Array<OpenAutoRoute<T>> {
  return routes
    .map((route) => ({ ...route, tier: openAutoTier(route.model) }))
    .sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier]);
}

const OPEN_AUTO_ALIASES = new Set([
  "open-auto",
  "open-connect/open-auto",
  "open-connect/open-auto/free",
]);

/** True when a request asks for the Open-Auto tiered router instead of a fixed model. */
export function isOpenAutoRequest(model: string): boolean {
  return OPEN_AUTO_ALIASES.has((model || "").trim().toLowerCase());
}

/** Statuses that justify rotating to the next available model without user escalation. */
export function isOpenAutoRotationStatus(status: number): boolean {
  return (
    status === 408 ||
    status === 409 ||
    status === 429 ||
    status === 529 ||
    (status >= 500 && status <= 504)
  );
}

/** Move the head of a candidate queue to its tail; empty and single-item queues are copied. */
export function rotateOpenAutoQueue<T>(queue: readonly T[]): T[] {
  if (queue.length <= 1) return [...queue];
  const [head, ...rest] = queue;
  return [...rest, head!];
}

export const OPEN_AUTO_MAX_CONCURRENCY = 8;

/** Fan independent subtasks out to parallel workers, capped for stability. */
export async function fanOutOpenAutoWorkers<R>(
  tasks: Array<() => Promise<R>>,
  maxConcurrency = OPEN_AUTO_MAX_CONCURRENCY,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  const cap = Math.max(1, Math.min(maxConcurrency, tasks.length));
  for (let index = 0; index < tasks.length; index += cap) {
    const batch = tasks.slice(index, index + cap).map((task) => Promise.resolve().then(task));
    results.push(...(await Promise.allSettled(batch)));
  }
  return results;
}

export type OpenAutoLoopResult = {
  status: "passed" | "failed";
  attempts: number;
  lastError: string | null;
};

/** Autonomous build-verify-improve loop: build, validate, autofix, repeat up to maxAttempts. */
export async function runOpenAutoBuildLoop(input: {
  build: () => Promise<void>;
  validate: () => Promise<void>;
  autofix?: (attempt: number, failure: string) => Promise<void>;
  maxAttempts?: number;
}): Promise<OpenAutoLoopResult> {
  const maxAttempts = Math.max(1, input.maxAttempts ?? 3);
  let lastError: string | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await input.build();
      await input.validate();
      return { status: "passed", attempts: attempt, lastError: null };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt < maxAttempts && input.autofix) {
        try {
          await input.autofix(attempt, lastError);
        } catch (fixError) {
          lastError = fixError instanceof Error ? fixError.message : String(fixError);
        }
      }
    }
  }
  return { status: "failed", attempts: maxAttempts, lastError };
}

/** Execute candidate routes in tier order, rotating past unavailable or rate-limited models. */
export async function runOpenAutoRoutes<T extends { name: string }, R>(
  routes: Array<{ upstream: T; model: string }>,
  attempt: (route: OpenAutoRoute<T>) => Promise<{ status: number; value: R }>,
): Promise<{
  route: OpenAutoRoute<T>;
  value: R;
  attempts: Array<{ model: string; status: number }>;
}> {
  const ordered = orderOpenAutoRoutes(routes);
  const attempts: Array<{ model: string; status: number }> = [];
  for (const route of ordered) {
    let status = 0;
    let value: R | undefined;
    try {
      const result = await attempt(route);
      status = result.status;
      value = result.value;
    } catch {
      status = 0;
    }
    attempts.push({ model: route.model, status });
    if (status >= 200 && status < 400) {
      return { route, value: value as R, attempts };
    }
    if (status !== 0 && !isOpenAutoRotationStatus(status)) break;
  }
  const attempted = attempts.map((entry) => entry.model + ":" + entry.status).join(", ");
  throw new Error("Open-Auto exhausted candidate routes [" + attempted + "]");
}
