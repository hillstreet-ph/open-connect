# Owner-managed key access

Existing keys can retain older OAuth/runtime permissions after new scopes become available. Creating another key does not repair the currently connected identity. Integrations → AI agents now allows the authenticated owner to select a supported access profile on an existing active key and explicitly apply it.

The management function preserves token hash/prefix, owner, organization, workspace, project and expiration. It refuses missing authentication, foreign, revoked or expired keys, unsupported profiles/scopes, and `control:write` without an actual Admin/legacy Owner role. Permission changes and prior grants are recorded atomically in the existing control audit ledger; identical requests produce no duplicate audit event. No key value is returned.

Profiles are defined in `src/lib/access-profiles.ts`. Developer includes private memory/knowledge reads and normal execution scopes. Administrator adds the supported control grant; real account roles and project/provider authorization still apply. Custom permissions reject unknown scope names, including wildcards.

## Validation and rollout

1. Run lint, all tests, typecheck, production build and SSR checks.
2. Run the disposable PostgreSQL fixture, owned-key-access migration and negative authorization tests in the existing Control Plane CI workflow. Never run fixture files against a provider database.
3. Apply only `supabase/migrations/20261010030000_owned_key_access.sql` to the verified Open-Platform project after review. This adds the management function and guards direct authenticated key writes; existing key grants and project data are preserved. Direct updates are restricted to irreversible revocation.
4. Deploy the reviewed source through the existing delivery path. An owner-approved update targets selected active keys; do not grant every key or another user's connections globally.
5. Probe the original connected identity after the 30-second auth-cache window. Run the original MCP memory/knowledge tool to verify its authorization, with minimal output. Grant presence alone is not data readiness. Project-bound keys read only their project memory/knowledge and never include the owner’s personal library; unbound owner clients retain their personal reads.

For a project runtime, run the existing credential broker:

```sh
node scripts/credential-broker.mjs exec open-connect-plugin -- node scripts/open-connect-access-check.mjs --scope knowledge:read --scope memory:read --project-id 50ad77bc-400b-419a-814a-7a8647e4338a
```

The probe does not export secrets, follow redirects, retry denied requests, or invoke provider writes. Plain-text403 and JSON scope errors require different repairs; preserve that distinction.

## Rollback

Restore supported prior grants from the selected key's `api_keys.update_access` audit event through authenticated management. Use Custom to restore the exact supported prior scope set whenever it differs from today’s profile definition, including historically stale standard profiles and legacy profiles. Wildcard or obsolete grants are not restored. Record this intentional limitation in rollback evidence. The UI can restore standard profiles; exact custom grants use the management function. Retain the prior application deployment. If reverting application code, the additive management function can remain unused without affecting legacy authentication. Do not revoke keys, erase audits, change expiry or move client data as rollback.

Open-System schema reconciliation remains governed by issue39's design, independent review, backup/restore and compatibility gates. This access-management migration does not move operational tables or make shared knowledge ingestion ready.
