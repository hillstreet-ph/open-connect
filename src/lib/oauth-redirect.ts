/**
 * OAuth redirect URI rules shared by dynamic client registration, the consent
 * page, and the callback builder.
 *
 * Native/desktop clients (RFC 8252 §7.3) cannot keep a secret and cannot
 * receive an https callback, so they use an http loopback address. Those
 * redirects ignore the port: the client picks a free local port at runtime.
 */

export const REDIRECT_URI_MAX_LENGTH = 2048;
export const LOOPBACK_PREFIX = "loopback:";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname.toLowerCase().replace(/^\[|\]$/g, ""));
}

/**
 * Canonical matching key for a redirect URI, or null when it is not allowed.
 * https URIs match exactly; http loopback URIs match by host and path so any
 * local port the client chose is accepted.
 */
export function redirectUriKey(value: unknown): string | null {
  if (typeof value !== "string" || !value || value.length > REDIRECT_URI_MAX_LENGTH) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.username || url.password || url.hash) return null;
  if (url.protocol === "http:" && isLoopbackHost(url.hostname)) {
    return `${LOOPBACK_PREFIX}${url.hostname}${url.pathname}`;
  }
  if (url.protocol === "https:") return value;
  return null;
}

export function isAcceptableRedirectUri(value: unknown): boolean {
  return redirectUriKey(value) !== null;
}

export function isLoopbackRedirectKey(key: string | null): boolean {
  return typeof key === "string" && key.startsWith(LOOPBACK_PREFIX);
}
