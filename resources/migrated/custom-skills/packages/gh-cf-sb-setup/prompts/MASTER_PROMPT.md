# Master Prompt

Execute `gh-cf-sb-setup/SKILL.md`.

Use only GitHub + Supabase + Cloudflare. Discover existing resources before mutation. Preserve production. Validate whether the application is compatible with this profile. If a dedicated persistent/container runtime is required, return PROFILE_INCOMPATIBLE instead of silently adding Docker Hub, Railway or Zeabur.

Invoke github-e2e-setup, supabase-e2e-setup and cloudflare-e2e-setup in dependency-aware order. Validate staging, enforce production gates, verify production end to end, then establish monitoring, backup, rollback, recovery and maintenance.
