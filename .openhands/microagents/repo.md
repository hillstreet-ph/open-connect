# Repository handoff

Use this file as the first-stop handoff for future agents working on `OrgHide/open-connect`.

## Current priorities

1. Preserve data across deploys and server moves.
2. Keep Railway startup aligned with the real runtime path.
3. Avoid duplicate fixes, duplicate branches, and duplicate startup scripts.
4. Keep skills, plugins, connectors, functions, prompts, and agents bootstrapped on deploy.
5. Keep backup and restore flows aligned with the bootstrap layout.

## Canonical setup map

- **Source of truth:** GitHub `main`
- **Runtime:** Railway uses `railway.toml` plus `railway-start.sh`
- **Database / auth / vault:** Supabase
- **Automation entrypoint:** `.github/workflows/autonomous_deployment.yml`
- **Supabase CLI bootstrap:** `scripts/bootstrap_supabase.sh`
- **Supabase auth notes:** `docs/supabase-auth.md`
- **Workflow notes:** `docs/canonical-workflow.md`
- **Human reference:** `docs/deployment-map.md`

## Current implementation facts

- Railway healthcheck path is `/health`.
