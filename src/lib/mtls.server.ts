/**
 * Cloudflare API Shield / client-certificate mTLS helpers (RFC 8705).
 *
 * When mTLS is enabled on the hostname, Workers/Pages expose:
 *   request.cf.tlsClientAuth
 *
 * Modes (env OAUTH_MTLS_MODE):
 *   off      — ignore client certificates (default for broad compatibility)
 *   optional — accept public clients (PKCE none); if a cert is presented, require SUCCESS
 *   required — token endpoint rejects requests without a verified client certificate
 *
 * Do NOT put a Cloudflare WAF rule that requires certs on all of open-connect.site —
 * that would break browsers, ChatGPT, and Claude. Prefer path-scoped rules or app-level mode.
 */

export type TlsClientAuthCf = {
  certPresented?: string;
  certVerified?: string;
  certRevoked?: string;
  certIssuerDN?: string;
  certSubjectDN?: string;
  certFingerprintSHA256?: string;
  certSerial?: string;
  certNotBefore?: string;
  certNotAfter?: string;
  certSKI?: string;
  certIssuerSKI?: string;
};

export type MtlsMode = "off" | "optional" | "required";

export type MtlsInspection = {
  mode: MtlsMode;
  presented: boolean;
  verified: boolean;
  revoked: boolean;
  fingerprintSha256: string | null;
  subjectDn: string | null;
  issuerDn: string | null;
  serial: string | null;
  verifiedStatus: string | null;
};

export function getMtlsMode(): MtlsMode {
  const raw = (process.env["OAUTH_MTLS_MODE"] ?? "optional").toLowerCase().trim();
  if (raw === "required" || raw === "off" || raw === "optional") return raw;
  return "optional";
}

/** Extract tlsClientAuth from a Cloudflare Workers/Pages Request. */
export function readTlsClientAuth(request: Request): TlsClientAuthCf | null {
  const cf = (request as Request & { cf?: { tlsClientAuth?: TlsClientAuthCf } }).cf;
  return cf?.tlsClientAuth ?? null;
}

export function inspectMtls(request: Request): MtlsInspection {
  const mode = getMtlsMode();
  const tls = readTlsClientAuth(request);
  const presented = tls?.certPresented === "1";
  const verified = tls?.certVerified === "SUCCESS";
  const revoked = tls?.certRevoked === "1";
  const fingerprint = (tls?.certFingerprintSHA256 ?? "").toLowerCase().replace(/:/g, "") || null;

  return {
    mode,
    presented,
    verified: presented && verified && !revoked,
    revoked,
    fingerprintSha256: fingerprint,
    subjectDn: tls?.certSubjectDN ?? null,
    issuerDn: tls?.certIssuerDN ?? null,
    serial: tls?.certSerial ?? null,
    verifiedStatus: tls?.certVerified ?? null,
  };
}

export type MtlsGateResult =
  | { ok: true; mtls: MtlsInspection }
  | { ok: false; status: number; error: string; error_description: string; mtls: MtlsInspection };

/**
 * Gate token (or other sensitive) endpoints per OAUTH_MTLS_MODE.
 * Public MCP clients use mode optional/off without presenting a cert.
 */
export function gateMtls(request: Request): MtlsGateResult {
  const mtls = inspectMtls(request);

  if (mtls.mode === "off") {
    return { ok: true, mtls };
  }

  if (mtls.presented && !mtls.verified) {
    return {
      ok: false,
      status: 401,
      error: "invalid_client",
      error_description: `Client certificate present but not verified (${mtls.verifiedStatus ?? "unknown"})`,
      mtls,
    };
  }

  if (mtls.mode === "required" && !mtls.verified) {
    return {
      ok: false,
      status: 401,
      error: "invalid_client",
      error_description:
        "mTLS client certificate required (OAUTH_MTLS_MODE=required). Use a Cloudflare-issued client cert.",
      mtls,
    };
  }

  return { ok: true, mtls };
}

/** RFC 8705 confirmation claim for certificate-bound access tokens (informational). */
export function certificateBoundCnf(fingerprintSha256: string | null): { "x5t#S256": string } | undefined {
  if (!fingerprintSha256) return undefined;
  // Cloudflare fingerprint is often hex; RFC 8705 uses base64url of SHA-256 hash of cert.
  // We expose hex fingerprint as opaque binding metadata for gateway checks.
  return { "x5t#S256": fingerprintSha256 };
}

export function mtlsMetadataFields(enabled: boolean) {
  if (!enabled) {
    return {
      token_endpoint_auth_methods_supported: ["none", "client_secret_post"] as string[],
    };
  }
  return {
    token_endpoint_auth_methods_supported: [
      "none",
      "client_secret_post",
      "tls_client_auth",
      "self_signed_tls_client_auth",
    ] as string[],
    tls_client_certificate_bound_access_tokens: true,
  };
}
