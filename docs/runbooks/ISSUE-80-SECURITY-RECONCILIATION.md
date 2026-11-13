# Issue #80: targeted security reconciliation

Observed on November 5, 2026 (Asia/Manila), project `huadtiuuoiriqrjpjxhr`.
This is a partial remediation; it does not clear the project-wide security issue.

## Timestamp helper

The live `platform.set_updated_at()` is a SECURITY INVOKER trigger with no
configured search path. Its body assigns `NEW.updated_at = now()` and returns
`NEW`. The follow-up migration
`20261104165157_harden_platform_timestamp_search_path.sql` pins only its lookup
path to `pg_catalog`, preserving the body, owner, signature and grants. It does
not change tables, RLS policies, application data or any OAuth grants.

Run the disposable regression with `bun run test:oauth:db` before deployment.
It applies the current OAuth resource/loopback migrations, verifies timestamp
updates under a caller-controlled search path, compares OAuth RPC ACLs before
and after this change, and runs the existing consent/PKCE/resource tests.

After the reviewed migration is applied, verify:

```sql
select proconfig
from pg_proc
where oid = 'platform.set_updated_at()'::regprocedure;
-- Expected: {search_path=pg_catalog}
```

Rerun security advisors: `function_search_path_mutable` for this function must
disappear. Do not infer that other findings were resolved. If the trigger body
has changed since inspection, stop and review its dependencies first. A required
emergency rollback can `ALTER FUNCTION platform.set_updated_at() RESET
search_path`; this restores the old warning and must be recorded as a rollback,
not a security resolution. Do not edit the applied migration.

## Do not replay the historical hardening migration wholesale

`20260920130000_harden_advisor_exposed_functions.sql` describes an old server-only
OAuth architecture. Current `src/routes/oauth/authorize.tsx` calls the consent
RPC with the authenticated user's JWT. `src/lib/gateway.server.ts` calls key
verification through `oauthDatabase()`, which uses the public project key.
Later migrations intentionally grant client roles access to these functions.
Revoking every SECURITY DEFINER function from `anon`/`authenticated` would break
valid OAuth/key verification paths. Review each function body, caller and policy
dependencies before changing its grants.

Live evidence also found `public.credential_secrets_meta` already configured with
`security_invoker=true`. Its old definer-view finding must not be reported as
still present solely from the historical issue description.

## Remaining work

- The live resource-bound consent RPC has an explicit `anon` EXECUTE grant even
  though later source migrations revoke it. Its body still rejects missing
  `auth.uid()`. Reconcile deployment history and remove only unintended grants
  in a separately tested follow-up; preserve authenticated consent and public
  registration/exchange/key-verification contracts.
- Membership helpers accept a supplied user UUID. Audit all RLS callers before
  restricting them to `auth.uid()` or revoking role access.
- Classify GraphQL-visible tables and RLS-enabled tables without policies by
  intended consumer; visibility warnings alone do not prove row disclosure.
  Keep service-role-only tables denied to clients rather than adding blanket
  allow policies.
- Classify the remaining SECURITY DEFINER RPCs individually. A warning does not
  establish that a function is unauthenticated or unsafe, nor that its grant is
  unnecessary.
- Leaked-password protection remains disabled. Enable through the supported
  Auth settings workflow after checking account/plan support and verify the
  resulting setting. This SQL migration does not change Auth configuration.
- Public-schema extensions need dependency-aware relocation testing before
  changing schema; existing operators/index definitions may depend on them.

Advisor references:
[mutable search path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable),
[RLS without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy),
[password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
