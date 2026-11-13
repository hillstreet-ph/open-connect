# E2E identity implementation status

Canonical model: [IDENTITY_MODEL.md](./IDENTITY_MODEL.md)

## Done

| Step | Status |
|------|--------|
| Org roles Owner / Admin / Member | `organization_members.role` constrained |
| Project roles Manager / Developer / Viewer | `project_members` + RLS |
| Environments | Seeded per project; new projects get dev/staging/production |
| Machine principals table | `principals` |
| Member vs Admin vs Owner nav | `app-sidebar.tsx` permission-aware groups |
| Roles UI | `/roles` shows org + project + three surfaces |
| Credential broker rule | Docs + connections use `credential_reference`, not raw secrets |
| Sentry / Zeabur connections | Metadata-only `app_connections` |

## Next (order)

1. Route guards keyed on org + project role  
2. Personal vs project vs service-account API keys  
3. Hide Member paths that scopes disallow  
4. Admin Console dedicated overview route (reuse existing pages)  

## Production env gate

Pages must have `SUPABASE_SERVICE_ROLE_KEY` and `LITELLM_MASTER_KEY` for full gateway health. Without them `model_upstream` is null.

## Product rule

Open Connect is the control plane. Independent apps consume it; they are not absorbed into it.
