# HillStreet Composio integration

The proposed cross-app contract is `config/hillstreet-composio.registry.json`.
It does not install a toolkit, deploy a client, or grant project access.

## Account import and preview

The authenticated admin's **Sync Composio accounts** button imports ACTIVE,
owned accounts using the configured Composio project. Server-side identity aliases
must map only that application user to their verified broker identities.
`COMPOSIO_API_KEY` stays in the deployment secret store. Optional configuration
uses `COMPOSIO_USER_MAPPINGS`, `COMPOSIO_AUTH_CONFIGS` and
`COMPOSIO_AUTH_CONFIG_ALIASES`; never infer these values from account names.

ChatGPT and other MCP clients can call `preview_composio_sync` with no arguments
using a personal admin key with `connections:read`. This reads the broker and
returns import candidates, matched/existing counts and toolkit count. It does
not write, assign connections or expose credential references. Organization,
workspace and project keys cannot enumerate this personal import preview.

Imports deduplicate by opaque broker account reference across provider aliases.
Different accounts remain separate. Existing duplicate records are preserved
for explicit reconciliation. Importing an account does not establish tool
execution or unrestricted provider scopes.

## Deployment and project assignment

1. Validate the branch through repository lint, tests, build and SSR checks.
2. Obtain the existing production approval before promoting the code or applying
   the connection assignment manifest. Respect `approval_required`; direct SQL
   must not be used to bypass it.
3. Preview the owned broker accounts. Apply the import through the existing admin
   connector workflow after approval.
4. Assemble the proposed toolkit from existing personal resource slugs. Keep
   the bundle private and require executable-package security review. Toolkit
   membership contains instructions/metadata and does not imply installed tools.
5. Assign only the selected connectors and resources to the five existing
   HillStreet projects. Provision separately scoped API keys for each runtime;
   preserve Admin, Developer and Member permissions.
6. Discover each app's actual MCP endpoint and OAuth metadata from its deployed
   service. Open-Box's domain is deliberately unresolved in the manifest.
7. Verify each client separately: authenticate, list tools, inspect one safe
   provider identity, and exercise an authorized test flow. Check audit evidence.

## Verified baseline: 2026-10-10 Asia/Manila

- Open-Connect gateway reported 108 connected accounts and all five projects.
- Composio's `custom_open_connect` connection was ACTIVE and returned gateway tools.
- Supabase `open-platform` and `open-operations` reported `ACTIVE_HEALTHY`.
- Project connection counts: Open-Connect 0, Open-System 0, Open-Box 0,
  Open-Teleset 0, Open-TGate 1. Personal counts do not imply project grants.
- Composio organization skill `sync-hillstreet-composio-feb69e05e879` was created
  and found through skill search. It is not yet imported into Open-Connect's
  resource library or installed into application runtimes.
- Production run `8525c9ea-ec26-430b-b422-4e5b53eb8f6b` stopped at
  `approval_required`; only discovery ran. No production assignments were applied.

Until deployment, import, scoped assignment and all client smoke tests have
passed, overall integration status remains partial. Roll back this code change
by reverting its commit; no database migration is included.
