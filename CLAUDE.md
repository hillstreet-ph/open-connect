# CLAUDE.md — Open-Connect

> AI agent collaboration guide for the Open-Connect project.

## Project Identity

- **Name**: Open-Connect
- **Role**: Control Plane — AI Resource Gateway, Marketplace, MCP/API Gateway, Model Gateway, Access Control Plane
- **Domain**: [open-connect.site](https://open-connect.site)
- **Language**: TypeScript (TanStack Start React with server routes)
- **Organization**: hillstreet-ph
- **Repository**: [github.com/hillstreet-ph/open-connect](https://github.com/hillstreet-ph/open-connect)

## Architecture Position

Open-Connect is the **control plane** of the HillStreet open-platform stack. It sits above Open-System (execution) and Open-Box (data/artifacts).

### Sister Projects

| Project | Role | Supabase project | Schema |
|---------|------|------------------|--------|
| **open-connect** | Control plane | `huadtiuuoiriqrjpjxhr` | `open_connect` |
| open-system | Execution plane | `huadtiuuoiriqrjpjxhr` | `open_system` |
| open-box | Data/artifact plane | `huadtiuuoiriqrjpjxhr` | `open_box` |
| open-kobeplay | Application | `hoseohvgoiarxluxqwqv` | `open_kobeplay` |
| open-tgate | Telegram gateway | `hoseohvgoiarxluxqwqv` | `open_tgate` |
| open-teleset | Communications server | `hoseohvgoiarxluxqwqv` | `open_teleset` |

## Infrastructure Ownership

| Layer | Owner | Details |
|-------|-------|---------|
| Source | GitHub | `hillstreet-ph/open-connect`, production branch `main` |
| Web/edge | Cloudflare Pages | Apex and `www`; build output `.output/public` |
| API/server | Zeabur | `api.open-connect.site`; control-plane container |
| Database/Auth/Storage | Supabase | Project `huadtiuuoiriqrjpjxhr`; schema `open_connect` plus intentional shared schemas |
| Container registry | Docker Hub | `hillstreet/open-connect` |
| Monitoring | Sentry | Organization `hillstreet`, project `open-connect` |
| Backup storage | Cloudflare R2 | `open-connect-backups` |

## Database Schemas

### Shared public/platform tables
- `user_roles` and `platform_shared.account_roles` — platform role assignments
- `categories`, `resources` — resource marketplace catalog
- `organizations`, `organization_members` — multi-organization support
- `oauth_clients`, `oauth_authorization_codes` — OAuth provider state

### `open_connect` schema
- `gateway_config` — gateway configuration
- `marketplace_listings` — marketplace entries
- `access_policies` — RBAC/ABAC/rate-limit/IP rules

## Auth and Roles

Canonical platform roles are `owner`, `admin`, and `user` (Member in the UI). Authentication does not replace authorization. Preserve RLS and test anonymous, member, admin, and owner access separately.

## Key Files

- `AGENTS.md` — repository history-preservation requirements
- `DEVELOPMENT.md` — branch and deployment flow
- `src/integrations/supabase/client.ts` — Supabase client
- `supabase/config.toml` — Supabase CLI configuration
- `.env.example` — variable contract; never commit real values
- `wrangler.toml` — Cloudflare Pages output and bindings

## Development and Deployment

Normal web and server-route delivery:

```
feature/* or fix/* → pull request → development/main → Cloudflare Pages → open-connect.site
```

Changes under `control-plane/**` additionally trigger `.github/workflows/control-plane-docker.yml`, which builds and publishes `hillstreet/open-connect`. Publishing an image does not itself prove or perform a Zeabur promotion; verify the exact image digest and Zeabur deployment separately.

## Environment Variables

Use the names defined by `.env.example`. Core examples:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — server-side only

Never expose privileged variables through a `VITE_` name.

## Important Rules for AI Agents

1. Read and follow `AGENTS.md` before making changes.
2. Never rewrite published Git history: no force-push, rebase, amend, or squash of commits already pushed.
3. Never hard-code or commit credentials.
4. Preserve production data and keep RLS enabled.
5. Use the `open_connect` schema for Open-Connect-specific data.
6. Work through normal feature/fix branches and protected pull requests.
7. Treat Cloudflare Pages as apex web owner and Zeabur as API/server origin.
8. Tag container releases with immutable commit identities; do not rely only on `latest`.
9. Check current PRs, migrations, environments, and provider ownership before creating resources.

## Quick Start

1. Read `AGENTS.md`, this file, `README.md`, and `DEVELOPMENT.md`.
2. Check `.env.example` for the variable contract.
3. Inspect existing migrations before changing schemas.
4. Check open pull requests and issues to avoid conflicts.
5. Run the repository's Bun-based lint, test, SSR, and build commands before pushing.
6. Preserve published history and use a new commit for every correction.
