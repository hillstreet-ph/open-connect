/**
 * Lightweight OAuth 2.1 helpers for MCP clients (ChatGPT, Claude, Grok, etc.).
 * Access tokens are Open-Connect API keys (oc_live_…).
 *
 * PKCE: S256 only (RFC 7636). "plain" is rejected.
 */
import { createHmac, randomBytes, createHash, timingSafeEqual } from "crypto";

const ISSUER = "https://open-connect.site";
const CODE_TTL_MS = 10 * 60 * 1000;

/** Only S256 is advertised and accepted. */
export const PKCE_METHOD_S256 = "S256" as const;

/** Full autonomous scopes advertised to AI clients */
export const OAUTH_SCOPES_SUPPORTED = [
  "openid",
  "mcp:connect",
  "resources:read",
  "resources:write",
  "connections:read",
  "connections:invoke",
  "models:read",
  "models:invoke",
  "tools:invoke",
  "secrets:read",
  "agents:invoke",
] as const;

const VERIFIER_RE = /^[A-Za-z0-9\-._~]{43,128}$/;
const CHALLENGE_RE = /^[A-Za-z0-9\-_]{43,128}$/;

function signingKey(): string {
  return (
    process.env["OAUTH_SIGNING_SECRET"] ||
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ||
    process.env["LITELLM_MASTER_KEY"] ||
    "open-connect-dev-signing-key"
  );
}

function b64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64url");
}

function sign(payload: string): string {
  return createHmac("sha256", signingKey()).update(payload).digest("base64url");
}

export function normalizeBase64Url(value: string): string {
  return value.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function isValidCodeVerifier(verifier: string): boolean {
  return VERIFIER_RE.test(verifier);
}

export function isValidCodeChallenge(challenge: string): boolean {
  const normalized = normalizeBase64Url(challenge);
  return CHALLENGE_RE.test(normalized);
}

export function isValidPkceMethod(method: string | undefined | null): boolean {
  return (method ?? "").toUpperCase() === PKCE_METHOD_S256;
}

export function verifyPkceS256(verifier: string, challenge: string): boolean {
  if (!isValidCodeVerifier(verifier)) return false;
  if (!isValidCodeChallenge(challenge)) return false;

  const expected = createHash("sha256").update(verifier, "ascii").digest("base64url");
  const provided = normalizeBase64Url(challenge);

  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(provided);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function verifyPkce(verifier: string, challenge: string, method: string): boolean {
  if (!isValidPkceMethod(method)) return false;
  return verifyPkceS256(verifier, challenge);
}

export type PkceAuthorizeInput = {
  code_challenge?: string;
  code_challenge_method?: string;
};

export type PkceValidationResult =
  | { ok: true; code_challenge: string; code_challenge_method: typeof PKCE_METHOD_S256 }
  | { ok: false; error: string; error_description: string };

export function validateAuthorizePkce(input: PkceAuthorizeInput): PkceValidationResult {
  const method = (input.code_challenge_method ?? "").trim();
  const challenge = (input.code_challenge ?? "").trim();

  if (!challenge) {
    return {
      ok: false,
      error: "invalid_request",
      error_description: "code_challenge is required (PKCE S256)",
    };
  }

  if (!method) {
    return {
      ok: false,
      error: "invalid_request",
      error_description: "code_challenge_method is required and must be S256",
    };
  }

  if (!isValidPkceMethod(method)) {
    return {
      ok: false,
      error: "invalid_request",
      error_description: "Only code_challenge_method=S256 is supported",
    };
  }

  if (!isValidCodeChallenge(challenge)) {
    return {
      ok: false,
      error: "invalid_request",
      error_description: "code_challenge must be a BASE64URL-encoded SHA-256 digest",
    };
  }

  return {
    ok: true,
    code_challenge: normalizeBase64Url(challenge),
    code_challenge_method: PKCE_METHOD_S256,
  };
}

export type AuthCodePayload = {
  key: string;
  exp: number;
  redirect_uri: string;
  client_id: string;
  code_challenge: string;
  code_challenge_method: string;
  scope?: string;
};

export function createAuthCode(data: Omit<AuthCodePayload, "exp"> & { exp?: number }): string {
  const payload: AuthCodePayload = {
    ...data,
    code_challenge: normalizeBase64Url(data.code_challenge),
    code_challenge_method: PKCE_METHOD_S256,
    exp: data.exp ?? Date.now() + CODE_TTL_MS,
  };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

export function parseAuthCode(code: string): AuthCodePayload | null {
  const [body, sig] = code.split(".");
  if (!body || !sig) return null;
  const expected = sign(body);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AuthCodePayload;
    if (!payload.key || !payload.exp || Date.now() > payload.exp) return null;
    if (!payload.code_challenge || !isValidPkceMethod(payload.code_challenge_method)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function newClientId(): string {
  return `oc_cli_${randomBytes(16).toString("hex")}`;
}

export function oauthMetadata() {
  return {
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/oauth/authorize`,
    token_endpoint: `${ISSUER}/oauth/token`,
    registration_endpoint: `${ISSUER}/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: [PKCE_METHOD_S256],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
    scopes_supported: [...OAUTH_SCOPES_SUPPORTED],
    service_documentation: `${ISSUER}/integrations`,
  };
}

export function protectedResourceMetadata(resource = `${ISSUER}/mcp`) {
  return {
    resource,
    authorization_servers: [ISSUER],
    bearer_methods_supported: ["header"],
    scopes_supported: [...OAUTH_SCOPES_SUPPORTED],
    resource_documentation: `${ISSUER}/integrations`,
  };
}

export { ISSUER };
