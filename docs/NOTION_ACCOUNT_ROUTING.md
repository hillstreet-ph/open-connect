# Optional Notion project/account routing guard

The uploaded account-separation requirement assigns software/infrastructure documentation to Kobeplay and personal/legal records to Justin Town. Authentication/ownership alone does not enforce that assignment. This guard pins managed Notion tool discovery/execution to an exact server-authorized project, saved connection and Composio account. It never chooses an account from a title, email, user-supplied tool argument or display label; it never falls back or silently redirects to another account.

## Deployment policy (not installed live)

NOTION_PROJECT_ACCOUNT_BINDINGS is a server-only JSON value. Example IDs below are synthetic, not real account/workspace/project identifiers:

    {"version":1,"cross_workspace_sync":false,"bindings":[
      {"project_id":"software-project","connection_id":"technical-connection","account_id":"ca_technical","workspace":"kobeplay"},
      {"project_id":"legal-project","connection_id":"personal-connection","account_id":"ca_personal","workspace":"justin_town"}
    ]}

Only an administrator who has verified the actual workspace grants may supply the real opaque IDs. Do not copy example IDs into production. The logical workspace keys are policy assignments, not independently verified Notion workspace identities. Existing database project-access and broker account ownership/ACTIVE/provider checks still apply.

- Absent/empty variable preserves existing behavior: NO workspace-isolation guarantee is active by default.
- Once configured, malformed/ambiguous/conflicting policies, missing project context and wrong connection/account fail closed before broker discovery or execution. Unscoped owner tool discovery is also blocked; plan that operational change before activation.
- Projects may share the same connection/account within one logical workspace. An account cannot be assigned to both workspaces. No cross-workspace-sync mode is accepted.
- This applies to the managed notion provider. Generic custom MCP/custom API endpoints cannot reliably be identified as Notion and are NOT covered. Account routing cannot guarantee content-flow isolation through free-text arguments or an agent's mixed context. Separate task/session contexts and reviewed data-flow controls are still required before claiming complete no-transfer isolation.
- No real mappings, OAuth grants, credentials, Notion pages, Railway variables, database schemas or deployment settings are changed by this PR. It creates no scheduler, sync job, standalone worker or new infrastructure.

The shared master-runner repository was inspected read-only. Its actual runner entrypoint and read-only event classifier must not be described as a deployed application orchestrator; the classifier reports executed=false. Uploaded Railway/Supabase inventory, counts and availability are historical source claims, not current verification from this session. Keep paid fallback/provisioning/production deployment disabled. The public hosted runner billing blocker reported earlier is not bypassed by moving work to a continuously metered host.

Offline tests use synthetic identities and mocked fetch. A successful test is not a live Notion connection or verified two-workspace operation.
