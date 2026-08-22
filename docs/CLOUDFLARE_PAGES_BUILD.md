# Cloudflare Pages — build settings (Open-Connect)

**Project name:** `open-connect-app`  
**Git repo:** `hillstreet-ph/open-connect`  
**Production branch:** `main`  
**Custom domains:** `open-connect.site`, `www.open-connect.site`

## Recommended build configuration

In **Workers & Pages → open-connect-app → Settings → Builds**:

| Setting | Value |
|---------|--------|
| **Framework preset** | Vite (or None) |
| **Build command** | `npm run build` |
| **Build output directory** | `dist` |
| **Root directory** | *(leave empty)* |
| **Production branch** | `main` |
| **Deploy command** | *(default / none)* |
| **Non-production branch deployments** | Optional (preview) |
| **Build watch paths** | *(empty = rebuild on any change)* |
| **Node.js version** | `22` (Environment variable `NODE_VERSION=22`) |

### Why these values

- `package.json` script: `"build": "vite build"`
- TanStack Start + Nitro Cloudflare target (via `@lovable.dev/vite-tanstack-config`) emits to **`dist`**
- SSR entry is `src/server.ts` (OAuth well-known + error handling)
- `wrangler.toml` sets `pages_build_output_dir = "dist"` and `nodejs_compat`

## Environment variables (Production)

Set under **Settings → Environment variables → Production**:

| Name | Type | Notes |
|------|------|--------|
| `SUPABASE_URL` | Plain | `https://gnqpwewbgldonarggzax.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Plain | anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret** | never expose to client |
| `LITELLM_BASE_URL` | Plain | model gateway base URL |
| `LITELLM_MASTER_KEY` | **Secret** | upstream master key |
| `OAUTH_SIGNING_SECRET` | **Secret** | optional; PKCE code signing |
| `OAUTH_MTLS_MODE` | Plain | `optional` (default) \| `off` \| `required` |
| `NODE_VERSION` | Plain | `22` |

Do **not** put service-role or master keys in `VITE_*` variables.

## Deploy flow

```text
git push origin main
  → Cloudflare clones hillstreet-ph/open-connect
  → npm install && npm run build
  → publish dist/ (+ Pages Functions / Worker)
  → https://open-connect.site
```

## Verify after deploy

```bash
curl -sS https://open-connect.site/api/v1/health
curl -sS https://open-connect.site/.well-known/oauth-authorization-server
```

Expect `status: ok` and `code_challenge_methods_supported: ["S256"]`.

## API (optional automation)

```bash
# List project (requires Account API token with Pages Edit)
curl -sS "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects/open-connect-app" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"

# Update build_config
curl -sS -X PATCH \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/pages/projects/open-connect-app" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "production_branch": "main",
    "build_config": {
      "build_command": "npm run build",
      "destination_dir": "dist",
      "root_dir": "",
      "build_caching": true
    }
  }'
```

Use an **API Token** (Pages → Edit) rather than a Global API Key when possible.
