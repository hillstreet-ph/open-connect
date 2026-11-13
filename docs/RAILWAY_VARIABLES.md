# Variable & Secret Contract — Open-Connect control plane (Railway)

For every required variable this documents: NAME, PURPOSE, SENSITIVE?,
REQUIRED?, SCOPE, ENVIRONMENT, OWNER, STATUS. **No values are recorded.**

Classification:
- `PUBLIC_CONFIG` — safe for any log, README, or public reference.
- `RUNTIME_CONFIG` — deployment-specific but not sensitive.
- `SECRET` — Railway **sealed variable** (encrypted at rest, masked in logs).
- `SHARED_CONFIG` — inherited from another service (not used by the control plane).
- `REFERENCE` — a `vault://...` reference to the Open-Connect credential broker.

## Control-plane variables (`OC_*`, pydantic `env_prefix="OC_"`)

| Name | Purpose | Sensitive? | Required? | Scope | Env | Owner | Status |
|------|---------|-----------|-----------|-------|-----|-------|--------|
| `OC_ENVIRONMENT` | Lane the service reports (`staging`/`production`) | No | Yes | RUNTIME_CONFIG | all | platform-owner | DEFINE |
| `OC_ALLOW_PRODUCTION` | Fail-closed gate; `true` only when `OC_ENVIRONMENT=production` | No | Yes | RUNTIME_CONFIG | production | platform-owner | DEFINE |
| `OC_PUBLIC_BASE_URL` | Public base URL for self-referential links | No | Yes | RUNTIME_CONFIG | all | platform-owner | DEFINE |
| `OC_OIDC_ISSUER` | Supabase Auth issuer URL | No | Yes | RUNTIME_CONFIG | all | platform-owner | DEFINE |
| `OC_OIDC_AUDIENCE` | OIDC audience (`authenticated`) | No | Yes | SHARED_CONFIG | all | platform-owner | DEFINE |
| `OC_ALLOWED_ORIGINS` | CORS allowlist origin(s) | No | Yes | RUNTIME_CONFIG | all | platform-owner | DEFINE |
| `OC_SESSION_TTL_SECONDS` | Session lifetime (seconds) | No | No | SHARED_CONFIG | all | platform-owner | DEFINE |
| `OC_E2B_CREDENTIAL_REF` | vault:// ref → E2B credential broker | No | No | REFERENCE | all | vault-owner | DEFINE |
| `OC_OPENBROWSER_CREDENTIAL_REF` | vault:// ref → OpenBrowser credential | No | No | REFERENCE | all | vault-owner | DEFINE |
| `OC_BROWSER_WORKER_CREDENTIAL_REF` | vault:// ref → browser-worker | No | No | REFERENCE | all | vault-owner | DEFINE |
| `OC_BROWSER_PROFILE_STORE_REF` | vault:// ref → browser-profile store | No | No | REFERENCE | all | vault-owner | DEFINE |
| `OC_GUACAMOLE_CREDENTIAL_REF` | vault:// ref → Guacamole | No | No | REFERENCE | all | vault-owner | DEFINE |
| `OC_MODEL_GATEWAY_CREDENTIAL_REF` | vault:// ref → model-gateway | No | No | REFERENCE | all | vault-owner | DEFINE |

## Secret variables (Railway sealed — actual values, migrated from Zeabur)

These are the values that, on Zeabur, lived as encrypted env vars. On Railway
they are sealed variables. **Never commit these.**

| Name | Purpose | Sensitive? | Owner | Status |
|------|---------|-----------|-------|--------|
| `OPENAI_API_KEY` | OpenAI upstream (frontend service) | Yes | vault-owner | DEFINE |
| `OPENAI_PROJECT_ID` | OpenAI project (frontend service) | Yes | vault-owner | DEFINE |
| `OPENAI_CAMPAIGN_MODEL` | campaign model id (frontend service) | No | platform-owner | DEFINE |
| `OPENAI_IMAGE_MODEL` | image model id (frontend service) | No | platform-owner | DEFINE |
| `LITELLM_MASTER_KEY` | LiteLLM gateway master key | Yes | vault-owner | DEFINE |
| `DATABRICKS_TOKEN` | Databricks workspace token | Yes | vault-owner | DEFINE |
| `DATABRICKS_SYNC_SECRET` | Databricks sync secret | Yes | vault-owner | DEFINE |
| `DATABRICKS_PSEUDONYMIZATION_KEY` | pseudonymization key | Yes | vault-owner | DEFINE |
| `ZEABUR_TOKEN` | (legacy) → migrated; not used by Railway service | Yes | vault-owner | MIGRATED |

## Procedure to apply sealed variables

```bash
# operator, once per environment
export RAILWAY_TOKEN=<RAILWAY_TOKEN>
railway login --token "$RAILWAY_TOKEN"

# development
railway variables set --service control_plane --environment development "OC_ALLOW_PRODUCTION=false"
railway variables set --service control_plane --env development OPENAI_API_KEY --secret   # (if needed)

# production — the fail-closed gate
railway variables set --service control_plane --env production OC_ENVIRONMENT --value "production"
railway variables set --service control_plane --env production OC_ALLOW_PRODUCTION --secret --value "true"
```

## Rules

- Never store a value in `docs/`, `.railway/railway.ts`, `.env`, or the image.
- `OC_*` values in `.railway/railway.ts` are **PLAIN_TEXT config or
  `vault://` references** — they are not secrets.
- Real secrets travel only as Railway sealed variables.
