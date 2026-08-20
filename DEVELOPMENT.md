# Development & autonomous delivery

## Branches

| Branch | Role |
|--------|------|
| `main` | Production. Cloudflare Pages production branch. Always deployable. |
| `development` | Integration branch. Feature work merges here first. |

## Flow

1. Create feature branch from `development` (or `main` for hotfixes).
2. Open PR → `development` (or `main` for critical fixes).
3. **CI — Validator** builds the app.
4. **PR — Reviewer** posts a checklist comment (secret scan heuristics).
5. Merge to `development`.
6. When CI succeeds on `development`, **Merger** opens/squashes promote PR to `main` when possible.
7. Push to `main` → Cloudflare Pages auto-deploy.
8. **Production smoke** runs after main CI (health + OAuth + pages).
9. **Self-heal** probes production hourly; opens GitHub issues on failure.
10. **Fixer** workflow can force an empty commit on `main` to re-trigger Pages.

## Workflows

- `.github/workflows/ci.yml` — build + production smoke
- `.github/workflows/pr-review.yml` — automated PR notes
- `.github/workflows/auto-merge-development.yml` — promote development → main
- `.github/workflows/self-heal-production.yml` — hourly probe
- `.github/workflows/fixer-redeploy.yml` — manual redeploy bump

## Secrets (GitHub repo settings)

Optional for richer CI:

- `VITE_SUPABASE_PUBLISHABLE_KEY` — used at build time in CI

Cloudflare already holds production runtime secrets.

## Human-only (cannot fully automate without tokens)

1. Supabase Dashboard → Auth → **Enable Google** with your Google client ID/secret.
2. Google Cloud → authorized redirect `https://gnqpwewbgldonarggzax.supabase.co/auth/v1/callback`.
3. Supabase → Database → Backups → enable **PITR** if on a plan that supports it.

Everything else (deploy, smoke, backups via `oc_backups`, self-heal issues) runs without manual steps once Actions are enabled.
