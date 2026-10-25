# Autonomous-Agents Team MCP card

The client card is served from `ui://open-connect/command-center-v3.html`. The v1 and v2 resource URIs remain readable. It shows Resources, Connections, Credentials, and AI Gateway. Counts, availability, and enabled actions reflect the authenticated key; credential values are never sent to the card.

Auto defaults on for a new account context and preserves a saved Off preference. The MCP initialization instructions ask the coordinating client to discover matching capabilities, verify actual executors, use authorized tools, record verified outcomes, and checkpoint long context. These instructions do not grant permissions or control the host UI. Clients without MCP Apps UI still receive the same tools and structured results.

## Tools and scope

- `auto_discover`: matches approved resource metadata and registered MCP functions allowed by the key; requires `resources:read`. It does not execute a catalog match.
- `run_agent_team`: requires both `models:invoke` and `agents:invoke` on a personal key. Planner, Builder, and Reviewer run concurrently. Each tries up to three rotated routes discovered from the account's connected free-model catalogs. There is no paid fallback. Workers return proposals and have no execution tools; the coordinating client verifies and executes using separately authorized tools.
- `save_context_checkpoint`: requires administrator role and `control:write`. Saves only the supplied redacted summary to owned Memory, with a deterministic ID for each user, project, and session. Project keys require verified project access. Organization/workspace keys without a project cannot write personal checkpoints.
- `list_my_memory` with `checkpoint_session`: restores a saved checkpoint under the caller's existing memory-read and project boundaries.
- `record_run_outcome`: personal administrator `control:write` only. Retries deduplicate events and Memory records. Three distinct successful runs of the same capability set promote reusable Knowledge. With `resources:write`, they also prepare a private prompt draft in Studio. Saved summaries are redacted; unknown secrets still must not be supplied as context.

Settings → Data contains Data Controls, Memory, Knowledge, and an explicit owned-context JSON export. Export excludes credential and connector tables and fails rather than silently truncating more than 20,000 records in either section.

Key creation and access-profile selection remain in Integrations; the card links there. Scope changes still require the authenticated account's authority. Routine Auto work uses existing grants. Host consent dialogs, native conversation compaction, paid-provider entitlements, and external application permissions remain controlled by their respective hosts/providers.

Learning drafts start unpublished and unverified. Frequency is not a security review or evidence that an action succeeded. A client must supply verified run outcomes, review draft content, and use the existing verification/publication flow with the required authority. The service does not observe or store unseen ChatGPT, Codex, or Claude history.

Refresh/reconnect Open-Connect in each client after deployment so it reloads the new card URI, tools, and initialization instructions.
