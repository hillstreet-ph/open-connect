# gh-cf-sb-zb-setup

Strict production E2E profile:

GitHub → Zeabur runtime → Supabase data/Auth/Storage → Cloudflare edge.

Required: GitHub, Supabase, Zeabur, Cloudflare.
Excluded: Docker Hub, Railway.

A Dockerfile does not automatically imply Docker Hub. The skill preserves existing production, enforces one-owner architecture, staging gates, persistence verification, backup/rollback/DR and evidence-backed completion.

Canonical instructions: `SKILL.md`.
No real credentials belong in this package.
