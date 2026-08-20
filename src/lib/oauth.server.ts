/**
 * Lightweight OAuth 2.1 helpers for MCP clients (ChatGPT, Claude, etc.).
 * Access tokens are Open-Connect API keys (oc_live_…).
 */
import { createHmac, randomBytes, createHash, timingSafeEqual } from "crypto";

const ISSUER = "https://open-connect.site";
const CODE_TTL_MS = 10 * 60 * 1000;

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
    return payload;
  } catch {
    return null;
  }
}

export function verifyPkce(verifier: string, challenge: string, method: string): boolean {
  if (method === "S256") {
    const computed = createHash("sha256").update(verifier).digest("base64url");
    return computed === challenge;
  }
  if (method === "plain") return verifier === challenge;
  return false;
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
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
    scopes_supported: [
      "mcp:connect",
      "models:read",
      "models:invoke",
      "resources:read",
      "openid",
    ],
    service_documentation: `${ISSUER}/models`,
  };
}

export function protectedResourceMetadata(resource = `${ISSUER}/mcp`) {
  return {
    resource,
    authorization_servers: [ISSUER],
    bearer_methods_supported: ["header"],
    scopes_supported: ["mcp:connect", "models:read", "models:invoke", "resources:read"],
    resource_documentation: `${ISSUER}/models`,
  };
}

export { ISSUER };
