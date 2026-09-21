type RuntimeEnvTarget = Record<string, string | undefined>;

/**
 * Copy string bindings into the Node-compatible environment without exposing
 * their values or replacing variables that were already supplied explicitly.
 */
export function injectRuntimeBindings(
  bindings: unknown,
  target: RuntimeEnvTarget = process.env,
): void {
  if (!bindings || typeof bindings !== "object") return;

  for (const [key, value] of Object.entries(bindings)) {
    if (typeof value !== "string" || value.length === 0 || target[key]) continue;
    target[key] = value;
  }
}

async function getCloudflareRuntimeEnv(): Promise<unknown> {
  try {
    // Pages/Workers exposes bindings here even when a framework fetch adapter
    // does not forward them through the handler's second argument.
    const mod = await import("cloudflare:workers");
    return (mod as { env?: unknown }).env ?? null;
  } catch {
    // Local Node-based tests and non-Cloudflare runtimes do not provide this
    // module. They keep using their normal process environment.
    return null;
  }
}

/** Make Cloudflare string bindings available to existing server-only modules. */
export async function hydrateRuntimeEnv(fetchEnv?: unknown): Promise<void> {
  injectRuntimeBindings(fetchEnv);
  injectRuntimeBindings(await getCloudflareRuntimeEnv());
}
