# Railway Architecture — Open-Connect

## Topology

```text
Open-Connect control plane (railway)
  project   : open-connect
  service   : control_plane      (Dockerfile: control-plane/Dockerfile)
  domains   : api.open-connect.site   (via Cloudflare)
  envs      : development | staging | production
  vars      : OC_* (config + vault refs) + sealed secrets
  persistence: none (stateless; data in Supabase)

Open-Connect frontend (cloudflare-pages)  — untouched
  domain   : open-connect.site, www.open-connect.site
  depends on : supabase (Supabase), litellm gateway (OpenRouter)

Data layer (unchanged)
  Postgres : Supabase open-platform (project_ref huadtiuuoiriqrjpjxhr)
  analytics: Databricks (open_connect / production)
  secrets  : Open-Connect credential vault (vault://)
```

## Environments

| Environment | Purpose | `OC_ENVIRONMENT` | `OC_ALLOW_PRODUCTION` |
|-------------|---------|------------------|-----------------------|
| development | CI / local builds | `staging` (default) | `false` |
| staging | pre-production validation | `staging` | `false` |
| production | live control plane | `production` | **`true`** (fail-closed gate) |

The control plane derives `environment` from `OC_ENVIRONMENT` and refuses to
serve production traffic unless `OC_ALLOW_PRODUCTION=true`.

## Service lanes (never reconverge at runtime)

The control plane talks to external lanes only via configured URLs/references:

- Supabase (auth + db) — `OC_OIDC_ISSUER` / Supabase env
- Model gateway — LiteLLM/OpenRouter (`LITELLM_*` on the frontend service)
- Optional web workers — E2B, OpenBrowser, Guacamole, browser-worker (vault refs)
EOF
cat > docs/RAILWAY_ARCHITECTURE.md <<'MENU'
# Railway Architecture — Open-Connect

## Topology

```text
Open-Connect control plane (railway)
  project   : open-connect
  service   : control_plane      (Dockerfile: control-plane/Dockerfile)
  domains   : api.open-connect.site   (via Cloudflare)
  envs      : development | staging | production
  vars      : OC_* (config + vault refs) + sealed secrets
  persistence: none (stateless; data in Supabase)

Open-Connect frontend (cloudflare-pages)  — untouched
  domain   : open-connect.site, www.open-connect.site
  depends on : Supabase (Supabase), LiteLLM gateway (OpenRouter)

Data layer (unchanged)
  Postgres : Supabase open-platform (project_ref huadtiuuoiriqrjpjxhr)
  analytics: Databricks (open_connect / production)
  secrets  : Open-Connect credential vault (vault://)
```

## Environments

| Environment | Purpose | `OC_ENVIRONMENT` | `OC_ALLOW_PRODUCTION` |
|-------------|---------|------------------|-----------------------|
| development | CI / local builds | `staging` (default) | `false` |
| staging | pre-production validation | `staging` | `false` |
| production | live control plane | `production` | **`true`** (fail-closed gate) |

The control plane derives `environment` from `OC_ENVIRONMENT` and refuses to
serve production traffic unless `OC_ALLOW_PRODUCTION=true`.

## Service lanes (never reconverge at runtime)

The control plane talks to external lanes only via configured URLs/references:

- Supabase (auth + db) — `OC_OIDC_ISSUER` / Supabase env
- Model gateway — LiteLLM/OpenRouter (`LITELLM_*` on the frontend service)
- Optional web workers — E2B, OpenBrowser, Guacamole, browser-worker (vault refs)
EOF
echo "RAILWAY.md + RAILWAY_ARCHITECTURE.md written"; wc -l docs/RAILWAY.md docs/RAILWAY_ARCHITECTURE.md
