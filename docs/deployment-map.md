# Deployment Map

## What is the canonical source of truth?

- **GitHub main branch** is the source of truth for code.
- **Railway** runs the app from `railway.toml` and `railway-start.sh`.
- **Supabase** holds the database, auth, and Vault secrets.
- **GitHub Actions** runs the automation entrypoint in `.github/workflows/autonomous_deployment.yml`.
- **LangSmith** should be used to generate plans, scripts, or workflows — not to manually click through infrastructure UIs.

## Main runtime layers

| Layer | Canonical file / place | Purpose |
|------|-------------------------|---------|
| App runtime | `backend/open_webui/main.py` | FastAPI app and health endpoints |
| Startup entrypoint | `railway-start.sh` | Restore data, then hand off to backend startup |
| Railway config | `railway.toml` | Runtime defaults and healthcheck alignment |
| Workspace bootstrap | `backend/open_webui/utils/workspace_bootstrap.py` | Re-seed skills, tools, and functions on startup |
| Integration loading | `backend/open_webui/integrations/__init__.py` | Loads manifests and connectors |
| GitHub automation | `.github/workflows/autonomous_deployment.yml` | Supabase + Railway bootstrap pipeline |
| Supabase bootstrap script | `scripts/bootstrap_supabase.sh` | CLI-based database/function bootstrap |
| Supabase auth reference | `docs/supabase-auth.md` | First-admin and OAuth setup notes |
| Workflow reference | `docs/canonical-workflow.md` | Canonical automation workflow and legacy workflow guidance |

## What should be stored where?

- **GitHub Secrets**: tokens used by Actions workflows.
- **Railway variables / secrets**: runtime values needed by the service.
- **Supabase Vault**: persistent bootstrap owner secrets and other sensitive values.
- **Repository files**: only non-secret defaults, startup code, and manifests.

## Authentication and first-admin bootstrap

A fresh Supabase project will often show no users at all. That is expected until the first signup or the bootstrap owner is created.

See [docs/supabase-auth.md](./supabase-auth.md) for the canonical auth/setup flow.

## What is not part of the current documented architecture?

The repository does **not** currently document a separate `open-connect-worker`, Redis job queue, `health_monitor.py`, `agent_vault`, `autonomous_memories`, MultiOn integration, or an OpenHands-style autonomous loop. If you see older notes describing those pieces, treat them as future-state ideas rather than the current production setup.

## Why deployments should not reset to zero

Deploys should *re-hydrate* the workspace instead of recreating it from scratch.

The intended flow is:

1. Railway starts the app with `railway-start.sh`.
2. The app initializes integrations.
3. `bootstrap_workspace_resources()` re-seeds repository-owned skills, tools, and functions.
4. The bootstrap owner secrets are read from Vault or Railway secrets.
5. The database, auth users, and workspace resources remain stable across deploys.

If the Supabase database looks empty, check these first:

- Whether the migrations were applied.
- Whether the bootstrap owner secrets exist.
- Whether the app startup logs show `Workspace bootstrap complete`.

## How to avoid duplicate branches and conflicting setup paths

- Prefer one PR per logical change.
- Reuse an existing branch if it already matches the fix.
- Close superseded PRs instead of creating a second copy of the same change.
- Keep the GitHub workflow, Railway config, and startup scripts aligned with each other.

## Human reading order

If you are trying to understand the project quickly, read in this order:

1. `README.md`
2. `docs/deployment-map.md`
3. `docs/supabase-auth.md`
4. `docs/canonical-workflow.md`
5. `.openhands/microagents/repo.md`
6. `railway.toml`
7. `scripts/bootstrap_supabase.sh`
8. `.github/workflows/autonomous_deployment.yml`
