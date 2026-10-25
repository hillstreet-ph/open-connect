/** Discover independent catalogs together, preserving each user's upstream object. */
export async function collectAutoFreeRoutes<T extends { name: string }>(
  upstreams: T[],
  load: (upstream: T) => Promise<string[]>,
): Promise<Array<{ upstream: T; model: string }>> {
  const catalogs = await Promise.all(upstreams.map(load));
  const routes = upstreams.flatMap((upstream, index) => [
    ...(upstream.name === "openrouter" ? [{ upstream, model: "openrouter/free" }] : []),
    ...catalogs[index]!.filter((model) => model !== "openrouter/free").map((model) => ({
      upstream,
      model,
    })),
  ]);
  // Prefer the provider's free router over a potentially slow individual reasoning model.
  return routes.sort(
    (a, b) => Number(b.model === "openrouter/free") - Number(a.model === "openrouter/free"),
  );
}
