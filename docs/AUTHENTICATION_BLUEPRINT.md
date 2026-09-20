# Authentication and ownership blueprint

## Authority

- GitHub connection identity: `master-kanor`
- Repository organization: `hillstreet-ph`
- Authentication provider: GitHub OAuth through Supabase Auth
- Authorization source: shared RBAC tables in each Supabase project

Passwords, OAuth client secrets, service-role keys, and recovery codes must not be committed. Store ownership and recovery records in Proton Pass Business and runtime secrets in the provider secret stores.

## Supabase Project A — open-platform

- Project reference: `huadtiuuoiriqrjpjxhr`
- OAuth callback: `https://huadtiuuoiriqrjpjxhr.supabase.co/auth/v1/callback`
- RBAC schema: `platform_shared`
- Applications: Open-Connect, Open-System, Open-Model, Open-Hub, Open-Box, Open-Automation

## Supabase Project B — open-operations

- Project reference: `hoseohvgoiarxluxqwqv`
- OAuth callback: `https://hoseohvgoiarxluxqwqv.supabase.co/auth/v1/callback`
- RBAC schema: `operations_shared`
- Applications: Open-KobePlay, Open-TGate, Open-Teleset, Open-Payment

GitHub OAuth Apps support one primary callback URL. Use a separate OAuth App for each Supabase project, owned by the GitHub organization when possible.

## Canonical roles

| Identity | Role | Scope |
|---|---|---|
| `tanauancharles1@gmail.com` | owner | All registered applications in both projects |
| `kairocasino8@gmail.com` | admin | All registered applications in both projects |
| `huxleysee@gmail.com` | user | All registered applications in both projects |

Accounts are materialized on first verified OAuth sign-in. An email not on the approved list receives no project membership.

## Application contract

Every application must:

1. Sign in with `supabase.auth.signInWithOAuth({ provider: 'github' })`.
2. Use the Supabase project assigned in `docs/INFRASTRUCTURE_BLUEPRINT.md`.
3. Read authorization from `account_roles` and `project_access` in its shared RBAC schema.
4. Enforce authorization server-side and with RLS; hiding UI controls is not authorization.
5. Never expose the `service_role` key to browser or mobile code.
6. Sign out and reject access when the identity is unapproved or lacks membership for the current `project_key`.

## Provider activation checklist

For each Supabase project:

1. Create a dedicated GitHub OAuth App.
2. Set its callback URL to the exact project callback above.
3. Store the GitHub client secret in Supabase Auth provider configuration.
4. Enable the GitHub provider.
5. Add only validated Cloudflare/Zeabur application origins to Supabase redirect URLs.
6. Require verified GitHub email access.
7. Test owner, admin, user, unapproved-user, logout, expired-session, and revoked-access paths.

Production activation remains incomplete until the OAuth Apps, provider secrets, and final application redirect origins are configured and verified.
