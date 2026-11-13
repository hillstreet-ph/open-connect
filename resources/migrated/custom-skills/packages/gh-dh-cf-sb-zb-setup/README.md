# gh-dh-cf-sb-zb-setup

Full production E2E profile:

GitHub → Docker Hub immutable artifact → Zeabur runtime → Supabase data/Auth/Storage → Cloudflare edge.

Required: GitHub, Docker Hub, Supabase, Zeabur, Cloudflare.
Excluded: Railway.

Primary invariant:
Git SHA → build/scan → Docker Hub digest → Zeabur staging → E2E → SAME digest → Zeabur production → Cloudflare → production verification.

Canonical instructions: `SKILL.md`.
No real credentials belong in this package.
