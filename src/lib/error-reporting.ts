/**
 * Production error reporting for Open-Connect.
 * No dependency on Lovable editor telemetry.
 */

export function reportError(error: unknown, context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") {
    console.error("[Open-Connect]", error, context);
    return;
  }

  const message =
    error instanceof Response
      ? `Response ${error.status}${error.url ? ` at ${error.url}` : ""}`
      : error instanceof Error
        ? error.message
        : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  console.error("[Open-Connect]", message, { stack, route: window.location.pathname, ...context });
}

/** @deprecated Use reportError — kept temporarily for import compatibility */
export const reportLovableError = reportError;
