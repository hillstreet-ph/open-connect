# CLAUDE.md — Open-Connect

> AI agent collaboration guide for the Open-Connect project.

## Project Identity

- **Name**: Open-Connect
- **Role**: Control Plane — AI Resource Gateway, Marketplace, MCP/API Gateway, Model Gateway, Access Control Plane
- **Domain**: [open-connect.site](https://open-connect.site)
- **Language**: TypeScript (React frontend + FastAPI backend)
- **Organization**: hillstreet-ph
- **Repository**: [github.com/hillstreet-ph/open-connect](https://github.com/hillstreet-ph/open-connect)

## Architecture Position

Open-Connect is the **control plane** of the HillStreet open-platform stack. It sits above Open-System (execution) and Open-Box (data/artifacts) and provides:

```
[Users] → [Open-Connect (control)] → [Open-System (execution)] → [Open-Box (data)]
              ↕                              ↕                         ↕
         [Supabase Auth]              [Agent Workers]           [Cloudflare R2]
```

### Sister Projects

| Project | Role | Supabase | Repo |
|---------|------|----------|------|
| **open-connect** | Control plane | huadtiuuoiriqrjpjxhr | this repo |
| open-system | Execution plane | huadtiuuoiriqrjpjxhr | hillstreet-ph/open-system |
| open-box | Data/artifact plane | huadtiuuoiriqrjpjxhr | hillstreet-ph/open-box |
| open-kobeplay | Application | hoseohvgoiarxluxqwqv | hillstreet-ph/open-kobeplay |
| open-tgate | Telegram gateway | hoseohvgoiarxluxqwqv | hillstreet-ph/open-tgate |
| open-teleset | Communications server | hoseohvgoiarxluxqwqv | hillstreet-ph/open-teleset |

## Infrastructure Stack

| Layer | Service | Details |
|-------|---------|---------|
| Source | GitHub | hillstreet-ph/open-connect, branch: main |
| Database | Supabase | Project: huadtiuuoiriqrjpjxhr, Schema: open_connect + public |
| Auth | Supabase Auth | GitHub OAuth, email/password |
| Container | Docker Hub | hillstreet/open-connect |
| Runtime | Zeabur | Project: open-connect-project |
| Edge/CDN | Cloudflare | Domain: open-connect.site |
| Monitoring | Sentry | TBD |

## Database Schema

### Public schema (shared tables)
- `profiles` — user profiles (auto-created on signup)
- `user_roles` — role assignments (owner/admin/user)
- `categories`, `resources` — resource marketplace catalog
- `organizations`, `organization_members` — multi-org support
- `oauth_clients`, `oauth_authorization_codes` — OAuth provider

### open_connect schema (project-specific)
- `gateway_config` — MCP/API/model/auth gateway configurations
- `marketplace_listings` — marketplace entries with pricing models
- `access_policies` — RBAC/ABAC/rate-limit/IP-allowlist rules

## Auth & User Roles

Three roles defined in `user_roles`:
- **owner** — full control, org management, gateway config
- **admin** — resource management, marketplace curation, user management
- **user** — browse marketplace, use resources, manage own API keys

RLS is enabled on all tables. Admin/owner checks use:
```sql
EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'owner'))
```

## Key Files

- `src/integrations/supabase/client.ts` — Supabase client with env-based URL selection
- `supabase/config.toml` — Supabase CLI config (project_id: huadtiuuoiriqrjpjxhr)
- `.env.example` — environment variable template (never commit real values)
- `supabase/functions/health/index.ts` — Edge function health check

## Development Workflow

```
feature/* → development → PR → main → Docker build → Docker Hub → Zeabur deploy
```

### Environment Variables (see .env.example)
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase publishable key
- `SUPABASE_SERVICE_ROLE_KEY` — server-side only, never in client code

## Important Rules for AI Agents

1. **Never hard-code credentials** — use environment variables
2. **Never commit .env files** — only .env.example with placeholder names
3. **Preserve existing data** — existing public schema tables have production data
4. **RLS is mandatory** — every new table must have RLS enabled
5. **Schema isolation** — use `open_connect` schema for project-specific tables
6. **Branch strategy** — work on feature/* or fix/* branches, PR to main
7. **Docker images** — tag with semver + commit SHA, not just `latest`
8. **Cross-project coordination** — open-system and open-box share the same Supabase project but use separate schemas

## Quick Start for New AI Agents

1. Read this file and the README.md
2. Check `.env.example` for required environment variables
3. Inspect `src/integrations/supabase/client.ts` for database connection patterns
4. Review existing migrations in `supabase/migrations/`
5. Check open PRs and issues before starting work
6. Use the `open_connect` schema for new tables
7. Test locally before pushing — run `npm run build` to verify
