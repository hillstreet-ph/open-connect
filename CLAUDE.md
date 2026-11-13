# CLAUDE.md — Open-Connect

> Repository-specific collaboration guide for Open-Connect agents.

## Start Here

Read, in order:

1. `AGENTS.md`
2. this file
3. `README.md`
4. `DEVELOPMENT.md`

The Lovable integration makes published history part of the product state. Never force-push, rebase, amend, or squash commits that are already pushed. Make corrections in new commits.

## Project Identity

- **Name:** Open-Connect
- **Role:** control plane and AI resource gateway
- **Repository:** `hillstreet-ph/open-connect`
- **Production web domain:** `open-connect.site`
- **Primary language/runtime:** TypeScript with TanStack Start
- **Production web owner:** Cloudflare Pages
- **API/server origin:** Zeabur
- **Transactional data and identity:** Supabase
- **Monitoring:** Sentry project `hillstreet/open-connect`

Do not infer another repository's deployed database, schema, domain, or runtime from this file. Read that repository's own inventory before making cross-project changes.

## Provider Ownership

| Concern | Owner | Contract |
|---|---|---|
| Source, branches, PRs, CI | GitHub | protected review flow |
| Apex and `www` web delivery | Cloudflare Pages | output `.output/public` |
| API/server runtime | Zeabur | API hostname only; never compete for the apex |
| Database, Auth, RLS, primary Storage | Supabase | project-specific migrations and server-only privileged keys |
| Container artifacts | Docker Hub | immutable commit/release tags |
| Errors and tracing | Sentry | `open-connect` project |
| Backup objects | Cloudflare R2 | separate from Supabase database recovery |

## Database Boundaries

The repository currently uses public application tables and shared platform structures such as `platform_shared.account_roles`. The `open_connect` schema is the isolation target for Open-Connect-specific structures, but never assume a table exists merely because it appears in architecture documentation.

Before changing data:

1. inspect the current migration history and generated types;
2. inspect the live target project and schema;
3. compare the intended migration with the deployed objects;
4. preserve data, grants, policies, and rollback evidence.

Never apply Open-System, Open-Model, Open-Box, or application-project migrations through this repository without a separately verified ownership map.

## Roles and Authorization

Two role layers coexist:

- **Application/platform roles:** `user`, `developer`, `publisher`, `admin`, `owner`
- **Organization UI roles:** Member, Admin, Owner; Member is stored as `user` in the canonical account-role table

Authentication is not authorization. Keep RLS enabled and test anonymous, member/user, developer, publisher, admin, owner, and privileged server behavior as applicable.

Use the established security-definer authorization helper (for example `private.has_role(auth.uid(), ...)`) where existing migrations use it. Do not query an RLS-protected role table from its own policy and reintroduce recursive evaluation.

## Development Flow

Normal work:

```
feature/* or fix/* → pull request to development → validation → development
development → promotion pull request → main → Cloudflare Pages
```

Critical hotfixes may target `main` directly through a protected pull request.

Changes under `control-plane/**` additionally trigger `.github/workflows/control-plane-docker.yml`, which builds and publishes `hillstreet/open-connect`. Publishing an image does not prove or perform a Zeabur promotion; verify the image digest and Zeabur deployment independently.

## Environment Contract

Use `.env.example` as the naming source. Core examples include:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — server-side only

Never use a `VITE_` name for a privileged credential. Never commit secret values or `.env` files.

## Verification

Before pushing:

- use the repository's Bun lockfile and scripts;
- run lint, unit/navigation tests, SSR tests, and the production build;
- validate migrations and RLS changes separately;
- check existing PRs and workflows to avoid duplicate or conflicting work;
- confirm Cloudflare output remains `.output/public`;
- confirm apex traffic stays on Cloudflare Pages and the API hostname stays on Zeabur;
- record evidence without printing secret values.

## Rules

1. Preserve published Git history.
2. Preserve production data and RLS.
3. Make the smallest reversible change.
4. Use new commits for fixes.
5. Do not create duplicate providers, projects, services, domains, schedulers, or secret stores.
6. Do not treat a passing container build as a verified Zeabur deployment.
7. Do not treat a database backup as a Storage backup.
8. Never claim deployment completion without DNS, TLS, application, authorization, and monitoring evidence.
