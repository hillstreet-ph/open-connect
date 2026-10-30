/** Discover independent catalogs together, preserving each user's upstream object. */
export async function collectAutoFreeRoutes<T extends { name: string }>(
  upstreams: T[],
  load: (upstream: T) => Promise<string[]>,
): Promise<Array<{ upstream: T; model: string }>> {
  const catalogs = await Promise.all(upstreams.map(load));
  const routes = upstreams.flatMap((upstream, index) => [
    ...(upstream.name === "openrouter" ? [{ upstream, model: "openrouter/free" }] : []),
    ...catalogs[index]!.filter(
      (model) => upstream.name !== "openrouter" || model !== "openrouter/free",
    ).map((model) => ({
      upstream,
      model,
    })),
  ]);
  // Prefer the provider's free router over a potentially slow individual reasoning model.
  return routes.sort(
    (a, b) => Number(b.model === "openrouter/free") - Number(a.model === "openrouter/free"),
  );
}

export type RouteTier = "free" | "paid";

/**
 * Compose the Auto routing ladder: every free route first (tried at zero cost),
 * then a cost-controlled paid backup per eligible upstream so a free rate-limit
 * never dead-ends the request. `paidModelFor` returns the backup model id for an
 * upstream, or null to skip it (keeps free-only providers free-only). A paid
 * backup identical to an existing free route is dropped so no provider is tried
 * with the same model twice.
 */
export function appendPaidBackupRoutes<T extends { name: string }>(
  freeRoutes: Array<{ upstream: T; model: string }>,
  upstreams: T[],
  paidModelFor: (upstream: T) => string | null,
): Array<{ upstream: T; model: string; tier: RouteTier }> {
  const seen = new Set(freeRoutes.map((route) => `${route.upstream.name}\n${route.model}`));
  const ladder: Array<{ upstream: T; model: string; tier: RouteTier }> = freeRoutes.map(
    (route) => ({ ...route, tier: "free" as const }),
  );
  for (const upstream of upstreams) {
    const model = paidModelFor(upstream);
    if (!model) continue;
    const id = `${upstream.name}\n${model}`;
    if (seen.has(id)) continue;
    seen.add(id);
    ladder.push({ upstream, model, tier: "paid" });
  }
  return ladder;
}
