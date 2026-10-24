---
name: credentials-e2e-setup
description: Autonomous end-to-end credential, secret, environment-variable, OAuth, service-account, token, API-key, signing-key, webhook-secret and application-configuration orchestrator for authorized applications and infrastructure.
when-to-use: Use when an authorized project requires discovery, creation, configuration, synchronization, validation, repair, inventory and lifecycle management of credentials and environment variables across connected providers.
---

# credentials-e2e-setup

## Mission

Make authorized application integrations operational end to end using REAL provider-issued credentials/configuration and securely generated application-owned secrets where required.

Never use fake, demo, placeholder or invented credentials as evidence of completion.

## Autonomous-first

Operate autonomously whenever authorized provider tools/APIs permit.

Prefer:
DISCOVER → API CREATE/READ → SECURE STORE → CONFIGURE CONSUMER → TEST → VERIFY

over manual copy/paste.

Do not bypass provider-enforced MFA, passkeys, CAPTCHA, OAuth consent, billing approval, legal acceptance, organization-owner approval or other security controls.

If unavoidable interactive action exists, return `PROVIDER_ACTION_REQUIRED` with the exact action and continue everything else that can be automated.

## Lifecycle

DISCOVER → INVENTORY → CLASSIFY → VALIDATE EXISTING → DETECT MISSING → CREATE WHEN AUTHORIZED → STORE SECURELY → DISTRIBUTE → CONFIGURE → TEST → REPAIR → RETEST → VERIFY → DOCUMENT.

REAL CREDENTIAL
+ CORRECT SECRET STORAGE
+ CORRECT ENVIRONMENT
+ CORRECT APPLICATION CONFIGURATION
+ SUCCESSFUL AUTHENTICATED TEST
= VERIFIED.

## Real values only

Never fabricate API keys, tokens, passwords, client secrets, service-account keys, DB passwords, JWT/signing secrets, webhook secrets, OAuth credentials, access/refresh tokens, private keys or provider IDs.

Never substitute fake/demo/example/dummy/changeme values for required production credentials.

If a real value cannot be obtained, status is BLOCKED or PROVIDER_ACTION_REQUIRED, never VERIFIED.

## Preserve existing credentials

DISCOVER → IDENTIFY → VALIDATE → OWNER/SCOPE/ENVIRONMENT → TEST → REUSE WHEN VALID.

Do not revoke, delete, disable, rotate or invalidate working credentials merely because another can be created.

Credential setup is not permission to destroy existing credentials.

Rotation/revocation requires explicit authorization or an established controlled lifecycle policy with safe cutover and rollback.

## Missing credentials

If missing, determine whether official authorized programmatic creation is supported.

If yes:
CREATE REAL CREDENTIAL → CAPTURE ONCE → STORE SECURELY → CONFIGURE → VALIDATE → INVENTORY.

If no:
PROVIDER_ACTION_REQUIRED.

Never fabricate missing values.

Provider-issued credentials must come from the provider's official mechanism.

Application-owned secrets may be generated locally only when the application specification expects them. Use a cryptographically secure generator and appropriate entropy/format.

## Classification

Classify as:
PUBLIC_CONFIG
CLIENT_SAFE_CONFIG
SECRET
PRIVILEGED_SECRET
DATABASE_CREDENTIAL
OAUTH_CLIENT_ID
OAUTH_CLIENT_SECRET
ACCESS_TOKEN
REFRESH_TOKEN
SERVICE_ACCOUNT
SERVICE_TOKEN
DEPLOY_TOKEN
WEBHOOK_SECRET
SIGNING_KEY
ENCRYPTION_KEY
SSH_PRIVATE_KEY
SSH_PUBLIC_KEY
CERTIFICATE
APPLICATION_SECRET
RUNTIME_VARIABLE.

Determine actual provider semantics. A publishable/client key may be client-safe; privileged/admin/service-role credentials are not.

## Inventory fields

For every credential/config item record:
NAME
PROVIDER
RESOURCE
TYPE
ENVIRONMENT
OWNER
CONSUMERS
SCOPE
CREATED_BY
STORAGE_LOCATION
VALIDATION_STATUS
LAST_VALIDATED
ROTATION_POLICY
EXPIRATION
NOTES.

Never duplicate secret values in documentation.

## Environment separation

Support development/staging/production.

Do not automatically reuse production secrets in development/preview.

Prefer environment-specific credentials when supported.

## Least privilege

Grant only permissions required by the consumer.

Avoid owner/admin/wildcard/full-control credentials when narrower scope is sufficient.

Record granted scopes.

## Dependency graph

APPLICATION → SERVICE → INTEGRATION → CREDENTIAL → SECRET STORE → CONSUMER.

Build from actual discovered architecture.

## Read before write

Discover existing credentials, secret names, environment variables, provider resources, OAuth clients, service accounts, deployment integrations, webhooks, DB connections, CI/CD environments and secret stores before creating anything.

## Idempotency and duplicates

DISCOVER → COMPARE → VALIDATE → APPLY MINIMAL DIFFERENCE → VERIFY.

Repeated execution must not create endless API keys/tokens/OAuth apps/service accounts/webhooks/secrets.

Before creation compare provider/resource/type/name/scope/consumer/environment/purpose.

Reuse a valid equivalent credential.

## Secret storage/distribution

Prefer provider-native secret stores appropriate to each consumer.

Secret movement:
PROVIDER → AUTHORIZED SECURE CHANNEL → TARGET SECRET STORE → APPLICATION CONSUMER.

Avoid:
PROVIDER → CHAT → COPY/PASTE → SOURCE CODE.

Never store real secrets in source, Dockerfiles, committed Compose files, README/docs, Git history, frontend JavaScript or public build artifacts.

## Docker

Never bake runtime secrets into image layers.

Separate build arguments from runtime variables.

Build-time secrets, if truly required, must use secure ephemeral mechanisms and must not remain in image history/layers.

## GitHub

Discover repository/Actions/environments/secret names/variables/deployment workflows/permissions.

Configure required secrets/variables at correct scope.

Use production environment protection when appropriate.

Never expose production secrets to untrusted PRs.

## Docker Hub

When used, determine required username/access token/repository/permissions.

Prefer scoped access token over account password.

Validate required registry authentication and push/pull capability.

## Supabase

Discover project URL, client-safe keys, privileged server keys, DB connection, Auth/OAuth, Vault and Functions secrets.

Separate client-safe configuration from privileged server configuration.

Never expose privileged Supabase credentials or DB password to frontend.

Choose appropriate DB connection method and least privilege.

For OAuth:
DISCOVER PROVIDER → DISCOVER EXISTING APP → CALLBACKS → CREATE/REUSE → OBTAIN CLIENT ID/SECRET → STORE → CONFIGURE APP/PROVIDER → TEST AUTHORIZATION/CALLBACK/SESSION → VERIFY.

Never invent OAuth credentials or bypass interactive consent.

## Cloudflare

Discover account/zone/API token/Worker secrets/Pages variables/bindings/DNS permissions.

Prefer scoped API tokens over broad/global credentials.

Validate required API access.

## Zeabur

Discover project/environment/services/runtime variables/deployment credentials/registry access/domains.

Configure secrets at correct environment/service.

For private images, configure authorized registry credential required by actual integration.

Validate deployment without exposing credential.

## Railway

Only configure when selected infrastructure profile includes Railway.

Do not configure Railway when excluded.

## Webhooks

Discover existing webhook; determine endpoint/events/signing requirement/environment.

Create/reuse authorized webhook.

Store signing secret securely.

Verify signature validation and prevent duplicate event subscriptions.

## Service accounts

Prefer machine/service identities for automation when appropriate.

Grant least privilege.

Avoid unnecessary personal-account tokens.

## Expiration

Record expiration when available.

Document renewal/rotation mechanism.

Do not claim durable operation from short-lived interactive token.

Short-lived access tokens should normally be generated dynamically; store durable mechanism needed to obtain them.

## Validation

Every credential must be tested against intended operation.

Examples:
GitHub → authorized API operation.
Docker → required registry auth/push/pull.
Supabase → authorized DB/API operation.
Cloudflare → required zone/deployment operation.
Zeabur → required project/deployment operation.
OAuth → authorization/callback/session.
Webhook → signed delivery verification.

Credential existence is not proof it works.

Validation output:
credential name
provider
consumer
operation tested
result classification
scope validation
status
timestamp.

Never print secret value.

## States

MISSING
DISCOVERED
VALIDATING
VALID
INVALID
EXPIRED
INSUFFICIENT_SCOPE
CREATION_REQUIRED
CREATED
STORED
CONFIGURED
TESTED
VERIFIED
BLOCKED
PROVIDER_ACTION_REQUIRED.

## Failure classes

INVALID_CREDENTIAL
EXPIRED_CREDENTIAL
INSUFFICIENT_SCOPE
WRONG_RESOURCE
WRONG_ENVIRONMENT
MISSING_VARIABLE
WRONG_CALLBACK
WRONG_SECRET_STORE
PROVIDER_PERMISSION_FAILURE
APPLICATION_CONFIGURATION_FAILURE.

Diagnose before replacement. Authentication failure does not automatically mean create another key.

## Repair

Maximum 3 automated repair cycles per integration failure:

DIAGNOSE → APPLY MINIMAL FIX → RECONFIGURE → RETEST → VERIFY.

Then STOP, preserve evidence and report blocker.

## Secret exposure policy

Internally handle credentials only through authorized secret-capable tools needed for configuration.

Do not echo reusable secret values into normal chat, logs, docs, issues, PR comments or reports.

## User credential inventory

After setup provide:
NAME
PROVIDER
TYPE
RESOURCE
ENVIRONMENT
PURPOSE
CONSUMER
SCOPE
STATUS
STORAGE LOCATION
CREATED/REUSED
EXPIRATION
LAST VALIDATED
RETRIEVAL/ROTATION LOCATION.

Do not print reusable secret itself.

If provider permits later viewing, report retrieval location.

If one-time display only, report VALUE_NOT_RETRIEVABLE_AFTER_CREATION and identify secure storage location.

Do not regenerate merely to display a value.

## One-time values

Capture one-time credential directly into required authorized secret stores during creation.

Verify storage before transient handling context is discarded.

## Contracts

Maintain:
credentials/credential-contract.md
credentials/environment-contract.md
credentials/provider-matrix.md

Names/metadata only, never values.

## Secret drift

Detect missing secrets, duplicates, wrong environment, wrong scope, stale/expired credentials and consumers referencing missing variables.

Do not rotate merely because metadata differs.

## Production gate

Require applicable:
CREDENTIAL_INVENTORY_COMPLETE
NO_REQUIRED_CREDENTIAL_MISSING
ALL_PROVIDER_CREDENTIALS_VALID
LEAST_PRIVILEGE_REVIEWED
SECRET_STORAGE_VERIFIED
NO_PRIVILEGED_SECRET_IN_FRONTEND
NO_SECRET_IN_SOURCE
OAUTH_VERIFIED
WEBHOOK_VERIFIED
DATABASE_AUTH_VERIFIED
CI_CREDENTIALS_VERIFIED
RUNTIME_CREDENTIALS_VERIFIED
PRODUCTION_INTEGRATION_TESTS_PASSED.

## Secret scanning

Scan applicable source/config/build/container/frontend/logs for committed/exposed credentials.

Do not expose detected value in report.

Report location/classification/risk/remediation.

If an exposed credential is found, do not automatically revoke unless lifecycle remediation is authorized.

Controlled rotation:
CREATE REPLACEMENT → STORE → UPDATE CONSUMERS → TEST → VERIFY → REVOKE OLD → VERIFY AGAIN.

Never revoke first.

## Audit

Record timestamp/provider/resource/credential name/operation/actor/result/evidence without secret values.

## Blocker report

CREDENTIAL:
PROVIDER:
RESOURCE:
ENVIRONMENT:
STATUS:
BLOCKER:
WHY_AUTOMATION_CANNOT_COMPLETE:
EXACT_PROVIDER_ACTION_REQUIRED:
WHAT_WILL_CONTINUE_AFTERWARD:

Never substitute fake credential.

## Execution order

1. Detect application/project and selected infrastructure profile.
2. Discover connected providers/resources/secret stores.
3. Discover existing credential names and variables.
4. Build dependency graph and inventory.
5. Classify public/client-safe/secret/privileged.
6. Validate existing credentials.
7. Reuse valid credentials.
8. Diagnose invalid credentials before replacement.
9. Identify missing credentials.
10. Determine programmatic creation support.
11. Create real provider-issued credentials when authorized/supported.
12. Securely generate application-owned cryptographic secrets when required.
13. Capture one-time values directly into authorized secret stores.
14. Configure GitHub/Docker/Supabase/Zeabur/Cloudflare/Railway/other selected consumers as applicable.
15. Configure OAuth/webhooks/service accounts where applicable.
16. Validate each credential against intended operation.
17. Configure application consumers and reload/redeploy only when needed.
18. Run integration tests.
19. Perform up to 3 bounded repair cycles.
20. Scan source/build/container/frontend/logs for exposure.
21. Verify least privilege and environment isolation.
22. Verify no required credential is missing.
23. Verify no unnecessary credential was revoked.
24. Generate contracts/provider matrix.
25. Generate evidence-backed final report.

## Completion

Require:
CREDENTIAL_INVENTORY_COMPLETE
+ NO_REQUIRED_CREDENTIAL_MISSING
+ REAL_PROVIDER_VALUES_USED
+ EXISTING_VALID_CREDENTIALS_PRESERVED
+ SECRET_STORAGE_VERIFIED
+ APPLICATION_CONFIGURATION_VERIFIED
+ LEAST_PRIVILEGE_REVIEWED
+ NO_PRIVILEGED_SECRET_IN_FRONTEND
+ NO_SECRET_IN_SOURCE
+ PROVIDER_AUTHENTICATION_TESTED
+ INTEGRATION_TESTS_PASSED
+ BLOCKERS_REPORTED_ACCURATELY.

Only then GLOBAL_STATUS = VERIFIED.

## Master command

Autonomously configure all credentials, secrets and environment variables required by the authorized application and selected infrastructure profile.

Discover before creating.
Reuse valid credentials.
Do not revoke/rotate working credentials unnecessarily.
Create REAL provider-issued credentials through official authorized mechanisms when missing and supported.
Generate application-owned secrets securely only when the application expects them.
Never fabricate credentials.
Never use fake/demo/example values as production configuration.
Store secrets directly in authorized secret stores.
Never commit or bake runtime secrets into images.
Never expose privileged credentials to frontend.
Configure all required consumers.
Validate every credential against the real provider operation it is intended to authorize.
Diagnose failures before replacement.
Use least privilege.
Preserve production integrations.
Do not bypass provider security controls.
Return PROVIDER_ACTION_REQUIRED only when provider-enforced interactive action cannot be automated.
After setup provide a complete metadata inventory showing what was reused/created, storage location, consumer, scope, validation, expiration and retrieval/rotation location—without printing reusable secret values.

A credential is VERIFIED only after the real provider accepts it for the required operation.
