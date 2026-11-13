/**
 * Client authentication for the OAuth token endpoint (RFC 6749 §2.3.1).
 *
 * Supports `client_secret_basic` (Authorization: Basic) and `client_secret_post`
 * (client_secret in the body). Public PKCE clients send only `client_id`.
 * Presenting credentials in both places is rejected, as is a Basic client ID
 * that disagrees with the body's client_id.
 */
export type ClientAuthResult =
  | { ok: true; clientId: string; clientSecret: string | null }
  | { ok: false; error: "invalid_client" | "invalid_request" };

function formDecode(value: string): string {
  // RFC 6749 §2.3.1: Basic credentials are application/x-www-form-urlencoded.
  return decodeURIComponent(value.replace(/\+/g, " "));
}

export function resolveClientAuth(
  authorization: string | null | undefined,
  body: Record<string, unknown>,
): ClientAuthResult {
  const bodyClientId = typeof body["client_id"] === "string" ? body["client_id"] : "";
  const bodySecret = typeof body["client_secret"] === "string" ? body["client_secret"] : "";
  const header = (authorization ?? "").trim();

  if (/^basic\s+/i.test(header)) {
    if (bodySecret) return { ok: false, error: "invalid_request" };
    let decoded: string;
    try {
      decoded = Buffer.from(header.replace(/^basic\s+/i, ""), "base64").toString("utf8");
    } catch {
      return { ok: false, error: "invalid_client" };
    }
    const separator = decoded.indexOf(":");
    if (separator < 1) return { ok: false, error: "invalid_client" };
    let clientId: string;
    let clientSecret: string;
    try {
      clientId = formDecode(decoded.slice(0, separator));
      clientSecret = formDecode(decoded.slice(separator + 1));
    } catch {
      return { ok: false, error: "invalid_client" };
    }
    if (!clientId || !clientSecret) return { ok: false, error: "invalid_client" };
    if (bodyClientId && bodyClientId !== clientId) return { ok: false, error: "invalid_request" };
    return { ok: true, clientId, clientSecret };
  }

  if (!bodyClientId) return { ok: false, error: "invalid_request" };
  return { ok: true, clientId: bodyClientId, clientSecret: bodySecret || null };
}

export const TOKEN_ENDPOINT_AUTH_METHODS = [
  "none",
  "client_secret_basic",
  "client_secret_post",
] as const;
