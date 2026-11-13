# CI/CD Template Notes

Generate actual workflows only after repository/framework discovery.

Expected lifecycle:
CI/security → Supabase migration validation → Cloudflare staging → E2E → protected production.

Never expose production secrets to untrusted pull requests.
