# Railway IaC Migration

Current Railway guidance prefers Infrastructure as Code using `.railway/railway.ts` and CLI config plan/apply workflows.

Legacy `railway.toml` / `railway.json` may still exist on older services. Discover and preserve them, but do not introduce legacy Config as Code for new services. Migrate intentionally through non-production validation rather than silently replacing production configuration.
