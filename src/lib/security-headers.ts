/**
 * Baseline browser security headers for every worker response.
 *
 * HTML documents additionally get an anti-clickjacking policy and a baseline
 * Content-Security-Policy. The CSP intentionally restricts only directives that
 * cannot break the SSR app (framing, plugins, <base>, form targets, mixed
 * content); a script-src allowlist needs per-request nonces from the SSR
 * renderer and is tracked separately. MCP widgets are delivered as inline
 * `ui://` resources, never by framing site URLs, so `frame-ancestors 'self'`
 * is safe. Existing values set by a route are never overwritten.
 */
export const BASELINE_CSP = [
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https:",
  "upgrade-insecure-requests",
].join("; ");

const ALL_RESPONSES: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
};

const HTML_RESPONSES: Record<string, string> = {
  "content-security-policy": BASELINE_CSP,
  "x-frame-options": "SAMEORIGIN",
};

function isHtml(response: Response): boolean {
  return (response.headers.get("content-type") ?? "").toLowerCase().includes("text/html");
}

/** Returns a response carrying the baseline headers; route-set values win. */
export function withSecurityHeaders(response: Response): Response {
  const extra = isHtml(response) ? { ...ALL_RESPONSES, ...HTML_RESPONSES } : ALL_RESPONSES;
  const missing = Object.entries(extra).filter(([name]) => !response.headers.has(name));
  if (missing.length === 0) return response;
  // Upgrade (101) and opaque responses cannot be re-wrapped safely.
  if (response.status === 101 || (response as { webSocket?: unknown }).webSocket) return response;
  const headers = new Headers(response.headers);
  for (const [name, value] of missing) headers.set(name, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
