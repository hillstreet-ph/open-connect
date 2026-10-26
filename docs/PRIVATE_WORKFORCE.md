# Private Workforce Directory and Registry

Open AI Agency → Workforce Directory. Existing teams and their two-to-six-role proposal runner remain under **Existing teams & proposal runs**. Their IDs, roles and run history are retained. Specialist chats do not create a durable autonomous workforce or invoke external provider actions.

## Set up your workspace

Choose Personal or an accessible project. Personal specialists belong to one registered account. Project members can view and launch specialists; existing project managers configure them. Each launch still requires access to attached references and an available, catalog-verified free model route. Department leads have no additional platform privileges.

Choose **Set up department templates** to create ten private department leads and seven Engineering specialist drafts. Repeating setup retains existing identities and configuration versions. Owned agent resources are linked as additional private review drafts by resource ID, never copied or published. For project setup, a private source must already be assigned to that project.

Engineering keeps the existing Software Architect, Developer and QA Reviewer roles and adds Frontend, DevOps, Security and Technical Writing. Equivalent roles reuse normalized canonical identities from `config/ai-agency.engineering.json`. The proposed Mobile Engineer definition in that file remains untouched and is not silently substituted into the approved seven-role roster. The existing Development team ID is recorded when the exact owned team can be reconciled. No eight-person roster is pushed through the legacy six-role runner.

## Configure, activate and launch

Agent Builder creates immutable versions with instructions, department/role, free model selection, allowed internal capabilities, selected skill descriptions, knowledge references and required apps. Skills are descriptions/references; executable packages are not run. Only selected knowledge excerpts are supplied to the model, with untrusted-data handling and common credential-pattern redaction. Do not put passwords, tokens or session material in configuration.

Saving creates a private draft. Review it in the profile, then activate the intended version. Activating a prior version performs a rollback without rewriting history. Disable prevents launches and further specialist requests; saved conversations remain readable to authorized users. Identity, ownership, scope and source origin remain fixed. Source availability is checked before use; deletion/revocation blocks execution rather than silently granting replacement access.

Launch opens a private conversation pinned to the activated version. Later activations do not change existing chats. The server loads configuration from the saved binding, checks current project/reference access and enforces the configured capability allowlist before every tool call. Task, schedule and automation targets stay inside the specialist's scope. Existing internal tool validation remains in force. Provider administration, shell access and background delegation cannot be enabled by instructions.

Activity shows your conversations, model route, request latency and response/failure records. Model cost is not a billing measurement; routes must be verified free. Requests can still fail because of provider quotas or expired connections. A generated response is not proof of a completed external operation. Specialist conversations are separate from global Agent-Helper history and automatic personal-memory capture.

## Connect apps and use ChatGPT

Connections recommends OAuth only when support is known. Composio credential forms are distinguished from OAuth; supported API/token and custom MCP alternatives remain available. Reconnect follows the saved account's method, including independent Custom MCP OAuth discovery, rather than blindly following a changed catalog route. Existing Proton native login and trusted executor requirements remain unchanged.

Copy a private specialist handoff from its profile and use the existing ChatGPT/Open-Connect MCP connection. No fictional custom GPT URL is generated. This is a configuration handoff, not a persistent ChatGPT worker or automatic publication. Public marketplace publication and durable autonomous orchestration are later releases.

## Validation and rollout

- Run `bun run test`, `bun run lint`, `bun run typecheck`, `bun run build`, and `bun run test:ssr`.
- Run `bun run test:workforce:db` for disposable PostgreSQL ownership, project membership, immutable versions, optimistic edits, disabled launches, pinned conversations and cleanup tests. Never apply fixture SQL to production.
- After building, run `bun run test:workforce:browser`. It uses local Chromium and an isolated backend fixture, covering mobile/desktop cards, setup, profile, activation, chat, version changes and disable. It never uses real credentials or provider accounts. The Browser plugin is not available in this session; regular Playwright provides the browser validation.
- Apply the additive registry migration before deploying the application. Do not edit applied migration SQL. Existing tables remain compatible; rollback the app and disable specialist launches if necessary, retaining immutable records.

Live owner login/MFA, upstream provider consent and actual account-specific model availability are separate operational checks. Automated fixtures do not certify those external services.

The reviewed additive migration is recorded in production as `20261026210052_private_workforce_registry`. Its repository SQL bytes are unchanged from the applied migration. No personal or project specialist records are seeded by the migration; setup runs under the authenticated user's real session.
