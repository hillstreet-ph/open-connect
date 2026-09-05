# Cloudflare API Shield mTLS for Open-Connect

Open-Connect supports **RFC 8705-style** client certificate inspection on `/oauth/token` via Cloudflare’s `request.cf.tlsClientAuth` fields.

Application modes (`OAUTH_MTLS_MODE` Cloudflare Pages env):

| Value | Behavior |
|-------|----------|
| `off` | Ignore client certificates |
| `optional` (default) | Public clients (ChatGPT/Claude PKCE) work without a cert. If a cert is sent, it must verify (`SUCCESS`) |
| `required` | `/oauth/token` returns `401 invalid_client` unless a verified client cert is present |

**Important:** Do **not** enable a WAF rule that requires mTLS on the entire `open-connect.site` hostname. That blocks browsers and OAuth authorize pages. Prefer app-level mode, or a **path-scoped** rule only for enterprise hosts.

---

## 1. Enable client certificates (dashboard)

1. Cloudflare Dashboard → **SSL/TLS** → **Client Certificates** (or **API Shield** → mTLS).
2. Create / enable the Cloudflare-managed CA for the zone that serves `open-connect.site`.
3. **Create Client Certificate** (or `POST /zones/{zone_id}/client_certificates` with a CSR).
4. Download the certificate + private key for the confidential client only.

API example:

```bash
# Create client certificate (requires zone id + API token with SSL Write)
curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/client_certificates" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "csr": "-----BEGIN CERTIFICATE REQUEST-----\n...\n-----END CERTIFICATE REQUEST-----",
    "validity_days": 365
  }'
```

---

## 2. Optional: path-scoped WAF rule (enterprise only)

Only if you want the **edge** to reject missing certs on a dedicated path:

Expression example (adjust host/path):

```text
(http.host eq "open-connect.site" and starts_with(http.request.uri.path, "/oauth/token") and not cf.tls_client_auth.cert_verified)
```

Action: **Block** or **Managed Challenge**.

Leave `/oauth/authorize`, `/`, `/mcp` (browser/agent PKCE) **out** of this rule unless those clients also present certs.

---

## 3. Pages environment variable

In **Cloudflare Pages** → project `open-connect-app` → Settings → Environment variables (Production):

```text
OAUTH_MTLS_MODE=optional
```

Use `required` only after all confidential clients install client certs.

Redeploy after changing env.

---

## 4. Client usage

Public (ChatGPT / Claude / MCP):

- No client certificate
- PKCE S256 + `token_endpoint_auth_method=none`

Confidential (mTLS):

```bash
curl -X POST "https://open-connect.site/oauth/token" \
  --cert client.crt --key client.key \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&code=...&code_verifier=...&redirect_uri=..."
```

On success with a verified cert, the token response may include:

```json
{
  "access_token": "oc_live_…",
  "cnf": { "x5t#S256": "<fingerprint>" },
  "mtls": { "bound": true, "subject_dn": "…" }
}
```

---

## 5. Verify Workers sees the cert

With a valid client cert, `request.cf.tlsClientAuth` should look like:

```json
{
  "certPresented": "1",
  "certVerified": "SUCCESS",
  "certRevoked": "0"
}
```

Without a cert:

```json
{
  "certPresented": "0",
  "certVerified": "NONE"
}
```

---

## 6. Discovery

When `OAUTH_MTLS_MODE` is not `off`, authorization-server metadata includes:

- `token_endpoint_auth_methods_supported`: `none`, `client_secret_post`, `tls_client_auth`, `self_signed_tls_client_auth`
- `tls_client_certificate_bound_access_tokens`: `true`

PKCE S256 remains required for the authorization code grant regardless of mTLS.
