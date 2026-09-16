# Platform backend assignment

This repository uses the shared **open-platform** Supabase project.

## Non-secret configuration

- Supabase project: `open-platform`
- Project reference: `huadtiuuoiriqrjpjxhr`
- Project URL: `https://huadtiuuoiriqrjpjxhr.supabase.co`
- PostgreSQL schema: `open_connect`
- Sentry: `hillstreet/open-connect`
- Container image: `${DOCKERHUB_USERNAME}/open-connect`

## Required deployment secrets

Keep `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `DOCKERHUB_TOKEN`, `ZEABUR_API_KEY`, and `SENTRY_AUTH_TOKEN` only in GitHub environment secrets and the deployment provider secret store.

The previously shared management tokens were exposed in chat and must be rotated before write-enabled CI/CD is activated.
