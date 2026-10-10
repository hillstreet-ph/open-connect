# Organization policy helper repair

On 2026-10-10, the authenticated Cloud Browser page could not load projects and the Projects page showed zero. An authenticated-role read of `organizations` failed with SQL42501: permission denied for `is_organization_member`. Its live ACL allowed only postgres, although the original organization migration grants authenticated and service_role execution. This also prevents embedded organization reads on the Cloud project query.

The additive repair restores those two intended callers on `is_organization_member(uuid)` and removes PUBLIC/anon callability from that helper and `can_manage_organization(uuid)`. It preserves function bodies, membership predicates, table grants, row policies, memberships, credentials and project sharing. Management grants remain unchanged. The helpers evaluate the caller's `auth.uid()`; this is not an organization-wide membership grant.

The disposable SQL regression loads the actual original organization migration, reproduces the denied helper baseline, then applies the actual repair. It checks owner/member organization reads, member write denial, nonmember and missing-identity reads, anonymous helper denial, service-role execution, row preservation and repeated application. CI uses PostgreSQL17; fixtures must never run on a provider database.

Apply only the reviewed grant-repair migration through the official Supabase migration flow after exact-head checks and review pass. The official migration authorization returned `Invalid or expired requestState` for the previously reviewed owned-key-access repair during this run; no live grant changed. Once authorization is repaired, verify the six existing projects through the authenticated Cloud selectors and project page. Key access repair (#304), schema reconciliation and provider session readiness are separate dependencies.

Rollback: restore the prior `is_organization_member` authenticated/service_role ACL only if required to contain a regression; doing so recreates the current UI denial. Keep anonymous execution denied. No rows or memberships need restoration.
