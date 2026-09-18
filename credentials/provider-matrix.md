# Provider credential matrix

| Provider   | Source of truth                             | Delivery                         | Automated validation                     | State when absent          |
| ---------- | ------------------------------------------- | -------------------------------- | ---------------------------------------- | -------------------------- |
| OpenAI     | OpenAI project service account/key          | Zeabur or GitHub environment     | Agents/Responses request                 | `PROVIDER_ACTION_REQUIRED` |
| GitHub     | GitHub App preferred; scoped token fallback | Installation token or `GH_TOKEN` | Read repo, push branch, inspect workflow | `PROVIDER_ACTION_REQUIRED` |
| Docker Hub | Scoped access token                         | GitHub production environment    | Registry login and image push/pull       | `BLOCKED`                  |
| Cloudflare | Scoped API token                            | GitHub production environment    | Account/zone/project read; deploy        | `BLOCKED`                  |
| Supabase   | Project keys and service identity           | Zeabur/Cloudflare secrets        | Auth/API/database operation              | `BLOCKED`                  |
| Zeabur     | Project deploy token                        | GitHub production environment    | Project/service read; deployment         | `BLOCKED`                  |
| Sentry     | Organization auth token and DSN             | GitHub/Zeabur environment        | Release/test-event verification          | `BLOCKED`                  |

OAuth consent, MFA, CAPTCHA, billing, ownership transfer, destructive actions, credential rotation, and revocation remain provider or owner approval gates.
