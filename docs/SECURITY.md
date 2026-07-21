# Security Policy - Open Connect

## Vulnerability Reporting
Please report vulnerabilities via the private maintainer channel. Do not use public GitHub issues.

## Infrastructure Security
- **Postgres 17**: Utilizing latest security patches and PG 17 features.
- **Strict RLS**: Row Level Security is enforced on ALL tables and buckets.
- **JWT Auth**: Session management handled via Supabase Auth with GitHub OAuth Client ID `Iv23liNMpTOpkEq2gxQe`.
- **Vault Protection**: Secrets are encrypted at rest via Supabase Vault.

## Secure Deployment
- **Autonomous Pipeline**: Verified deployments with automatic dependency scanning.
- **Railway Isolation**: Process isolation and persistent volume encryption.
