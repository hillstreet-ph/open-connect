# Provider Routing

- GitHub: source/release control plane
- Docker Hub: image registry
- Supabase: DB/Auth/Storage
- Cloudflare: DNS/TLS/edge
- Railway OR Zeabur: runtime

Do not require all providers. Reuse existing infrastructure and delegate provider-specific configuration to its E2E skill.
