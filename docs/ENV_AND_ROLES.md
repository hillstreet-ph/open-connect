# Environment, secrets, roles & upload adoption

**Domain:** https://open-connect.site  
**Pages project:** `open-connect-app` · production branch `main`  
**Supabase:** `huadtiuuoiriqrjpjxhr` (canonical production project)

## Cloudflare Pages — production env

| Variable | Type | Purpose |
|----------|------|---------|
| `SUPABASE_URL` | secret | Server + Auth |
| `SUPABASE_PUBLISHABLE_KEY` | secret | Server publishable / client fallback |
| `SUPABASE_SERVICE_ROLE_KEY` | secret | RLS bypass (server only) |
| `VITE_SUPABASE_URL` | plain | Build-time SPA Supabase URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | plain | Build-time SPA key |
| `VITE_APP_URL` | plain | `https://open-connect.site` (OAuth / OpenRouter headers) |
| `LITELLM_BASE_URL` | secret | OpenRouter API base |
| `LITELLM_MASTER_KEY` | secret | OpenRouter API key |
| `GITHUB_CLIENT_SECRET` | secret | GitHub OAuth (if enabled) |
| `OAUTH_MTLS_MODE` | plain | `optional` |

Optional later:

| Variable | Purpose |
|----------|---------|
| `OPENROUTER_API_KEY` | Explicit OpenRouter key (if not using `LITELLM_*`) |
| `OPENROUTER_BASE_URL` | Override OpenRouter base |

**Bindings:** `OC_KV` → namespace `f4224065e31949268604c2c2b70b9aa1`

After changing secrets: **Retry deployment** on the latest production deploy so runtime and build pick up values.

## Roles and access scope

Human access uses three separate scopes:

| Scope | Roles | Purpose |
|------|------|------|
| Platform | **Member**, **Admin**, **Owner** | Member is the standard signed-in role. Admin manages permitted platform and organization settings. Owner retains full platform and organization control. |
| Organization | **Member**, **Admin**, **Owner** | Admins manage organization people, groups, and settings. Owners manage ownership and appoint admins. |
| Project | **Viewer**, **Developer**, **Manager** | Viewer reads an assigned project. Developer builds within an assigned project. Manager manages that project's members, installs, and environments. |

Project membership is independent for every project. Organization Members only see projects explicitly shared with them. Project resources, environments, and memberships follow that same project boundary. Machine principals such as agents and API clients use scoped credentials and never receive human Owner or Admin roles.

Legacy platform role records remain readable for existing data, but new platform assignments are limited to Member, Admin, and Owner. Assign people by account email in System administration; invite new people through Organization settings.

Upload adoption is available to every signed-in Member (minimum platform role: user).

## API key scopes (all accounts / new keys)

New `oc_live_` keys auto-receive full autonomous scopes:

`openid`, `mcp:connect`, `resources:read`, `resources:write`, `connections:read`, `connections:invoke`, `models:read`, `models:invoke`, `tools:invoke`, `secrets:read`, `agents:invoke`

Create keys at `/api-keys` after login.

## Upload / catalog adoption paths

| Path | Use |
|------|-----|
| `/studio` | Create agents, skills, prompts, plugins, MCP, connectors |
| `/resources` | Marketplace browse; login required to download |
| Bulk upload | Studio / resource library auto-detect type |
| `/downloads/...` | Control-plane demo and skill packages |
| `/guides` | Professional E2E setup (authenticated) |

## Data plane seed (reference)

- Organizations / projects / environments seeded for HillStreet scopes  
- Published resources in marketplace catalog  
- Model gateway: OpenRouter via `LITELLM_*`  

## Smoke

```bash
curl -sS https://open-connect.site/api/v1/health
# expect status ok, model_upstream openrouter, VITE_* true after redeploy

# with oc_live_ key:
curl -sS https://open-connect.site/v1/models -H "Authorization: Bearer oc_live_…"
```
