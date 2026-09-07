# Infrastructure inventory — Open Connect

**Rule:** identifiers and references only — never raw credentials.  
**Updated:** 2026-09-07

## Topology (authoritative)

```text
GitHub          hillstreet-ph/open-connect (source, CI, tags)
Cloudflare      Pages open-connect-app · domain open-connect.site · KV OC_KV
Supabase        project open-connect (gnqpwewbgldonarggzax) · ap-northeast-1
Models          LiteLLM / OpenRouter via /v1
Runtime edge    Cloudflare Pages (primary production web)
Zeabur          BLOCKED — connector not authorized in this workspace
Vercel          Explicitly out of scope for Open Connect
```

## Provider map

| Responsibility | Provider | Resource | Environment | Status |
|----------------|----------|----------|-------------|--------|
| Source | GitHub | hillstreet-ph/open-connect | all | PRODUCTION VERIFIED |
| Edge / DNS / TLS | Cloudflare | open-connect.site · open-connect-app | production | PRODUCTION VERIFIED |
| KV | Cloudflare | open-connect-kv / OC_KV | production | PRODUCTION VERIFIED |
| DB / Auth / Storage | Supabase | gnqpwewbgldonarggzax | production | PRODUCTION VERIFIED |
| Model upstream | OpenRouter via LiteLLM | env LITELLM_* | production | PRODUCTION VERIFIED |
| App connections | Pipedream / Composio (adapters) | normalized in OC | — | PARTIAL |
| Composio GitHub | Composio account github_airily-baya | agent tools | — | ACTIVE |
| Composio Google Drive | googledrive_coder-oleg | agent tools | — | ACTIVE |
| Composio Supabase | supabase_gib-tarman | agent tools | — | ACTIVE |
| Zeabur runtime | Zeabur | — | — | **PROVIDER_ACTION_REQUIRED** |
| Sentry | Sentry | — | — | NOT STARTED |

## Related Supabase projects (consumers — do not merge into OC DB)

| Name | Ref | Region |
|------|-----|--------|
| open-connect | gnqpwewbgldonarggzax | ap-northeast-1 |
| open-box | ymhiwerqyegvondndkjn | ap-northeast-1 |
| open-tgate | ozpikxbmrxmgssvgxjdn | ap-northeast-1 |
| open-teleset | wkewimymzbhgbkumlxmg | ap-southeast-1 |
| open-system | xrolgpxvgznjuplyrkny | ap-southeast-1 |
| webui-open-connect | rxpkxtzzkvwgjtbtcctc | ap-northeast-1 |

## Phase 1 identity (2026-09-07)

| Table | Purpose |
|-------|---------|
| environments | development / staging / production per project |
| principals | human · ai_client · ai_agent · service_account · api_client |
| audit_events | sensitive operation log (no secret payloads) |

**Seeded org:** HillStreet (`slug=hillstreet`)  
**Seeded project scopes:** General, Open Connect, Open Box, Open TGate, Open System, Omni-Agents, Open Hub, Open Teleset, KobePlay — each with development (default), staging, production environments.

## Credential policy

- Store secrets only in Supabase Vault / agent_vault metadata + broker path.  
- Spreadsheet credentials are **temporary** and not source of truth.  
- Never commit API keys, tokens, or R2 secrets to git.  
- Agents receive **capabilities**, not master tokens.

## Zeabur next step

1. Authorize Zeabur in the agent connector workspace (or provide ZEABUR_TOKEN via secure channel).  
2. Run `zeabur-e2e-setup` DISCOVER mode — audit existing projects before create.  
3. Use Zeabur only for **workers / long-running jobs** if needed; keep public site on Cloudflare Pages.  
4. Do not move Auth or primary DB off Supabase.
