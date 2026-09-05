# Deploy status

**Forced rebuild:** 2026-09-05T14:55:00Z

## Production targets

- Domain: https://open-connect.site
- Pages project: `open-connect-app`
- Branch: `main`
- Stack: GitHub + Cloudflare + Supabase only

## Expected routes after this deploy

| Path | Notes |
|------|--------|
| `/` | LobeHub-style marketing hub |
| `/resources` | Marketplace (login to download) |
| `/studio` | Create agents/skills (auth) |
| `/orgs` | Organizations & projects (auth) |
| `/guides` | Professional setup (auth) |
| `/dashboard` | Workspace hub |
| `/integrations` | Open WebUI + clients |
| `/downloads/open-connect-control-plane-demo/` | Static E2E package |
| `/api/v1/health` | Health JSON |
| `/mcp` | MCP (401 without key) |

## Verify

```bash
curl -sS https://open-connect.site/api/v1/health
curl -sS -o /dev/null -w "%{http_code}\n" https://open-connect.site/studio
# studio may redirect to /auth when logged out (200 or 302) — not 404
```
