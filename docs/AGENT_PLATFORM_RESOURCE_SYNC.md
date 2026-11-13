# Agent platform resource sync

The canonical product remains `hillstreet-ph/open-connect`. The hourly
`agent-platform-resource-sync.yml` workflow monitors resource manifests from:

| Platform              | Source                                                             |
| --------------------- | ------------------------------------------------------------------ |
| ChatGPT / OpenAI      | `openai/skills`                                                    |
| Claude                | `anthropics/skills` (plugin marketplace sync also runs separately) |
| Mistral               | `mistralai/mistral-vibe`                                           |
| Manus-owned resources | `master-kanor/manus-skills`                                        |
| Open System           | `hillstreet-ph/open-system`                                        |
| Hermes upstream       | `NousResearch/hermes-agent`                                        |

These are explicit GitHub sources, not exhaustive exports of proprietary app
stores or private account libraries. `master-kanor/manuskills` has no matching
resource manifests; its pinned migration source remains governed by the existing
resource consolidation lock and retirement checklist.

## Data flow

1. Read repository metadata and recursive Git trees using the Actions token.
2. Discover `SKILL.md`, `plugin.json`, `.mcp.json` and `mcp.json` blob metadata.
3. Record stable source identity, blob SHA and tree SHA. Changed blob SHAs change
   review fingerprints. A default-branch update is not a claim of a stable release.
4. Deduplicate identical manifest blobs across forks, prefer an official source,
   and retain source aliases. Preserve unrelated candidates during hourly updates.
5. Refuse an incomplete tree, archived source, empty result, oversized result or
   failed required source. A failed run cannot overwrite the committed catalog.
6. Update the existing `automation/marketplace-catalog-sync` review branch, dispatch
   CI and request normal auto-merge. The daily and hourly collectors share a
   non-cancelling concurrency group to avoid simultaneous catalog writes.
7. The existing production publisher imports committed metadata into the review
   queue after merge. New content remains unverified and requires license,
   security and runtime compatibility review before installation/publication.

The repository-level license is evidence only; it does not establish a subpackage's
license. Discovery does not fetch executable contents, install packages, create
OAuth clients, expand grants or overwrite provider credentials. Git history retains
previous snapshots; content-addressed migration packages remain append-only.

## Run and verify

```sh
bun install --frozen-lockfile
bun run agent-platforms:sync
bun run marketplace:validate
node --test scripts/agent-platform-discovery.test.mjs
```

Optional `GITHUB_TOKEN` or `GH_TOKEN` improves API rate limits. No Firecrawl or
production credential is needed for the hourly job. Existing daily directory
crawling and Claude marketplace workflows keep their separate configurations.
Redacted collection evidence is uploaded as a workflow artifact.

## Composio and live readiness boundaries

On 2026-10-26, the authenticated gateway reported administrator access, 148
connection entries and 911 published resources. Composio preview matched 105
ACTIVE accounts, all already imported, with zero missing candidates. Read-only
OpenAI model listing and Manus project listing succeeded through Open Connect.
Mistral tool discovery returned an internal error despite a configured connection.

The currently exposed Composio tools provide connection management, tool
execution and skill management, but discovery did not expose an administrative
auth-config/custom-toolkit provisioning API. The Open Connect administrator
capability report also reported `secure_injection_available: false`. Automated
provider registration must not be claimed complete on that evidence.

To finish connector provisioning, bind an authenticated Composio management
executor with organization-level authorization through a secure server-side
credential resolver. It must list existing auth configs and custom MCPs before
creating anything; key reconciliation by provider, organization, auth method and
endpoint rather than display name. Do not copy provider tokens between platforms.
OAuth consent, provider registration and callback validation remain required.
Only mark an integration ready after a real authenticated provider operation,
scope checks, revocation checks and client-specific MCP/OAuth tests pass.

This hourly workflow automates catalog discovery. It does not claim to implement
automatic Composio provisioning, provider OAuth consent or universal client support.
