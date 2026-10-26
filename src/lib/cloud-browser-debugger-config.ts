/** Requested Cloud Browser defaults. This is configuration, not proof of worker availability. */
export const CLOUD_BROWSER_DEFAULTS = {
  browser_provider: "openconnect",
  debugger: "chrome",
  allow_provider_fallback: true,
  capture: ["console", "network", "dom", "performance", "screenshots"],
} as const;

export type DiagnosticCapture = (typeof CLOUD_BROWSER_DEFAULTS.capture)[number];
export type DebuggerSelection = "chrome" | "provider";

export function selectBrowserDebugger(input: {
  chromeWorkerAuthenticated: boolean;
  sessionCdpCompatible: boolean;
  providerNativeInspectionAvailable: boolean;
  allowFallback?: boolean;
}): { debugger: DebuggerSelection | null; reason: string } {
  if (input.chromeWorkerAuthenticated && input.sessionCdpCompatible) {
    return { debugger: "chrome", reason: "authenticated_compatible_worker" };
  }
  if (
    (input.allowFallback ?? CLOUD_BROWSER_DEFAULTS.allow_provider_fallback) &&
    input.providerNativeInspectionAvailable
  ) {
    return { debugger: "provider", reason: "chrome_unavailable_provider_fallback" };
  }
  return { debugger: null, reason: "no_compatible_debugger" };
}
