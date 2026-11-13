# Platform backend assignment

This repository uses the shared **open-platform** Supabase project.

## Non-secret configuration

- Supabase project: `open-platform`
- Project reference: `huadtiuuoiriqrjpjxhr`
- Project URL: `https://huadtiuuoiriqrjpjxhr.supabase.co`
- PostgreSQL schema: `open_connect`
- Sentry organization: `hillstreet`
- Sentry project: `open-connect`
- Container image: `${DOCKERHUB_USERNAME}/open-connect`

Public environment variables (see `INFRASTRUCTURE_BLUEPRINT.md` Section 6 for the full contract):

- `SUPABASE_URL` = `https://huadtiuuoiriqrjpjxhr.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY` (from Supabase dashboard)
- `SUPABASE_PROJECT_REF` = `huadtiuuoiriqrjpjxhr`
- `SUPABASE_SCHEMA` = `open_connect`
- `SENTRY_ORG` = `hillstreet`
- `SENTRY_PROJECT` = `open-connect`

## Deployment topology

open-connect uses **Cloudflare Pages** for its public frontend at `open-connect.site`. The **Zeabur** service runs only the backend API. This differs from other HillStreet repositories where Zeabur serves both frontend and backend behind Cloudflare proxy.

When the backend requires its own distinct Docker image, it should be tagged as `${DOCKERHUB_USERNAME}/open-connect` (or `open-connect-api` if the web frontend also ships a container). This naming decision should be finalized before enabling Docker-based CI/CD.

## Required deployment secrets

The following secrets must exist only in GitHub environment secrets and the deployment provider secret store (Zeabur). Never commit values to source.

- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service-role key for open-platform
- `SUPABASE_DB_URL` — Direct PostgreSQL connection string for open-platform
- `DOCKERHUB_USERNAME` — Docker Hub account for publishing images
- `DOCKERHUB_TOKEN` — Docker Hub access token
- `ZEABUR_API_KEY` — Zeabur deployment API key
- `SENTRY_AUTH_TOKEN` — Sentry release/sourcemap upload token

The previously shared management tokens were exposed in chat and must be rotated before write-enabled CI/CD is activated.
