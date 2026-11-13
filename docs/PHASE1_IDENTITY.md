# Phase 1 — Identity foundation

**Status:** IMPLEMENTED (schema + seed) · 2026-09-07  
**Branch policy:** changes applied on production Supabase + documented on `main`

## Delivered

1. `environments` — per-project `development` | `staging` | `production`  
2. `principals` — typed non-human + human principals  
3. `audit_events` — action log without secret bodies  
4. `api_keys.principal_id` · `api_keys.environment_id` optional FKs  
5. RLS for environments/principals; audit select for org members  
6. HillStreet org + nine blueprint project scopes + three envs each

## Authorization hierarchy (now supported in data)

```text
ORGANIZATION (HillStreet)
  └── PROJECT (Open Connect, Open Box, …)
        └── ENVIRONMENT (development | staging | production)
              └── PRINCIPAL (human | ai_client | ai_agent | service_account | api_client)
                    └── ROLE + SCOPE + POLICY → ALLOW/DENY
```

## Not yet (Phase 2+)

- Full scope/policy engine tables  
- Server-side authorize() helper on every mutation  
- Principal UI for AI client onboarding  
- Environment selector in shell  
- Automated RLS cross-tenant tests  

## Verification

```sql
select p.name, e.name from projects p join environments e on e.project_id = p.id;
select count(*) from principals;
select count(*) from audit_events;
```

Live health remains: `https://open-connect.site/api/v1/health`
