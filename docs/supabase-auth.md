# Supabase Auth and First-Admin Bootstrap

## What is expected on a fresh project?

A brand-new Supabase project will usually show:

- no users in the Auth > Users list
- no custom tables yet
- no OAuth users until someone signs in successfully

That is normal.

## Canonical setup flow

1. Configure the Supabase project URL and keys in the app/automation layer.
2. Set the first workspace owner credentials in Supabase Vault or Railway secrets:
   - `OPEN_CONNECT_BOOTSTRAP_OWNER_NAME`
   - `OPEN_CONNECT_BOOTSTRAP_OWNER_EMAIL`
   - `OPEN_CONNECT_BOOTSTRAP_OWNER_PASSWORD`
3. Start the Open Connect service.
4. On startup, the app will create or migrate the bootstrap owner and seed the workspace resources.
5. After that, the Auth > Users list will only show accounts that actually signed up or were created by the bootstrap flow.

## OAuth / sign-in providers

If you want OAuth login to appear and work in the Supabase dashboard, configure it in the Supabase Auth settings page:

- **Auth > Sign In / Providers** for provider configuration
- **Auth > URL Configuration** for redirect/callback URLs
- **Auth > OAuth Server** if your Supabase project exposes that option in the dashboard

The repository cannot toggle those dashboard controls for you. The app can only rely on the environment variables and dashboard configuration you set.

## Why the app should not reset to zero

The app is designed to rehydrate workspace resources on every startup:

- skills
- tools
- functions
- bootstrap owner account

If those are missing after deploy, check:

- whether the bootstrap owner secrets are set
- whether the migration/bootstrap workflow ran
- whether the app startup logs include `Workspace bootstrap complete`

## How to reduce confusion

- Keep Supabase for auth/database/vault
- Keep Railway for runtime and service variables
- Keep GitHub Actions for repeatable bootstrap/deploy automation
- Keep LangSmith for planning or code generation, not manual dashboard operations
