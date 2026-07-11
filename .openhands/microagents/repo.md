# Repository handoff

Use this file as the first-stop handoff for future agents working on `OrgHide/open-connect`.

## Current priorities

1. Preserve data across deploys and server moves.
2. Keep Railway startup aligned with the real runtime path.
3. Avoid duplicate fixes, duplicate branches, and duplicate startup scripts.
4. Keep skills, plugins, connectors, functions, prompts, and agents bootstrapped on deploy.
5. Keep backup and restore flows aligned with the bootstrap layout.

## Current implementation facts

- Railway healthcheck path is `/health`.
- Railway boots through `railway-start.sh`, which restores local/Supabase backups before delegating to `backend/start.sh`.
- `backend/start.sh` normalizes `LOG_LEVEL` before passing it to Uvicorn so `INFO` does not crash startup.
- `Dockerfile.railway` now bootstraps integrations from `scripts/integrations/install-integrations.sh` during image build.
- Startup was previously blocked by `install_tool_and_function_dependencies()` in `backend/open_webui/main.py`; a `backend/sitecustomize.py` shim now backgrounds that call so Railway can reach `/ready` before long dependency/model downloads finish.
- `backend/sitecustomize.py` now wraps the Open WebUI FastAPI lifespan so `init_integrations()` runs on startup and `bootstrap_workspace_resources()` re-seeds skills, tools, and functions in the background after deploy.
- `backend/open_webui/integrations/agents/framework.py` now loads the repository's `.agents.json` and `.connectors.json` manifests into the runtime agent hub.
- `.env.example` now documents the Redis Cloud variables (`REDIS_URL`, `WEBSOCKET_REDIS_URL`, and related flags) instead of hardcoding any secret values.
- Backup/restore scripts include workspace resources in addition to the database and user data.
- The canonical backup target remains Supabase Storage bucket `open-connect-backups` with `backups/` prefix.
- Release notes use semantic versioning in `CHANGELOG.md`.
- Railway deployment `68094d02-6a30-4eed-a410-0f0121b20025` succeeded with the startup-relaxation fix.

## What future agents should check first

1. Read `AGENTS.md` and this file.
2. Inspect `railway.toml`, `Dockerfile.railway`, `railway-start.sh`, and `backend/start.sh` before editing deployment behavior.
3. Reuse the existing backup/restore scripts before creating new ones.
4. Reuse existing PRs/branches when possible.
5. Verify that any new workspace resource path is included in both backup and restore flows.
6. Confirm secrets stay in Railway/GitHub/Supabase variables; never commit them.

## Avoid

- Creating parallel startup paths.
- Resetting workspace resources during deploys.
- Renaming deployment env vars independently across docs and runtime scripts.
- Shipping a fix without verifying `/health` and restore behavior.

## Suggested release discipline

- Keep `CHANGELOG.md` updated before tagging a release.
- Use `vX.Y.Z` tags for production releases.
- Tag only after the PR is merged and Railway has been verified.
