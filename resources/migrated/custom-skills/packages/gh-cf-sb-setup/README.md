# gh-cf-sb-setup

Production E2E profile for exactly:

- GitHub
- Supabase
- Cloudflare

Excluded by default:
- Docker Hub
- Railway
- Zeabur

This skill orchestrates source/fork governance, CI/security, Supabase DB/Auth/RLS/Storage/backend services, Cloudflare Pages/Workers/DNS/TLS/WAF/edge, staging, production verification, monitoring, backup, rollback, recovery and maintenance.

Canonical instructions: `SKILL.md`.

No real credentials belong in this package.
