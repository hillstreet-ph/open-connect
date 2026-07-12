# Canonical Automation Workflow

## One workflow to remember

The canonical end-to-end automation entrypoint is:

- `.github/workflows/autonomous_deployment.yml`

That workflow is responsible for:

1. checking out the repository
2. installing the Supabase CLI
3. running `scripts/bootstrap_supabase.sh`
4. syncing Railway variables from GitHub Secrets / Variables
5. redeploying the Railway service
6. running a health-check smoke test

## Supporting files

- `scripts/bootstrap_supabase.sh` — creates migrations and deploys Supabase functions
- `railway.toml` — canonical Railway runtime variables
- `railway-start.sh` — startup handoff for restore + runtime boot
- `backend/open_webui/utils/workspace_bootstrap.py` — re-seeds skills/tools/functions on startup

## Historical workflows

Other workflows in `.github/workflows/` are still present for backup, release, or legacy deployment support. They should be treated as secondary unless a release or recovery task explicitly calls for them.

This workflow does **not** describe a separate Redis worker, background queue, or self-healing daemon. The current runtime rehydrates workspace resources during startup and keeps Railway as the live execution environment.

## Why this matters

When there are too many overlapping deployment paths, the workspace can appear to reset to zero or create duplicates.

To avoid that:

- use one canonical bootstrap workflow
- keep secrets out of git
- keep runtime bootstrap code and deployment documentation aligned
- reuse the same owner/bootstrap secrets every time
