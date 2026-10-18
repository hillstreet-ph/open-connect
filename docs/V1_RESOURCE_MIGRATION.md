# V1 → Open-Connect reusable resource migration

Source: `hillstreet-ph/v1-open-connect`; target: `hillstreet-ph/open-connect`.
Status: inventory/review only. **Do not run old SQL seed migrations against the current production database.**

## Confirmed reusable candidates
- `.skills/**`: skill documents and supporting references; review source, license, safety, platform and duplicates before importing.
- `supabase/migrations/*seed*.sql`: legacy catalog metadata for agents, MCP, prompts, plugins, tools and related resources. **Parse and transform data**, never execute legacy DDL or seed SQL directly.
- `supabase/functions/oc-api/index.ts`: legacy REST resource-list and skill lookup contract; compare against current `/api/v1/resources` and port missing tested behavior only.
- `supabase/functions/oc-mcp/index.ts`: legacy MCP tool descriptions; compare with canonical `/mcp`, do not deploy a second MCP endpoint.
- `supabase/functions/oc-plugin/index.ts`: legacy plugin schema; convert eligible reusable definitions to portable Agent Plugins manifests where appropriate.
- `src/pages/{SkillDetailPage,MCPPage,GatewayPage}.tsx` and resource cards: review useful UX patterns; do not copy incompatible old routing or overwrite current Studio.

## Migration gates
1. Inventory source records and package files; record origin, SHA256, author, license, version, category, dependencies and execution requirements.
2. Compare canonical normalized slug + source identity + content hash with existing Open-Connect resources. Keep current resource ownership, IDs, review status and audit history. Never overwrite verified content without review.
3. Reject secrets, embedded tokens, private data, unlicensed material, unsafe commands and unsupported runtimes. Quarantine unknown-license and unknown-source candidates.
4. Transform approved candidates to current resource schema. New entries start private, unpublished and unverified.
5. Scan actual package contents, validate manifests and dependencies, test in isolated environments, and require independent security-review evidence.
6. Publish only verified and explicitly authorized resources; record review evidence and provenance.
7. Run unit/integration tests, staging smoke tests, Android Chrome checks, and production health checks before merge/deploy.

## Scope boundaries
- Preserve current auth, RLS, API keys, MCP endpoint and credential vault. Never transfer secrets or import old database schema blindly.
- Keep KobePlay client data separate from HillStreet general resources.
- A catalog description is not an executable tool. Do not claim functionality until invocation is tested.
- Avoid bulk marking `verified=true`; existing review action must be hardened to require evidence before bulk publishing.
- Preserve existing live resources and connections; no destructive deduplication.

## Initial findings
- The legacy repository contains `.skills/` content, legacy Supabase catalog seed SQL, `oc-api`, `oc-mcp`, and `oc-plugin`.
- Current Open-Connect has a resource registry, marketplace catalog validation scripts, and a review UI.
- No complete item-by-item diff, license review, or runtime tests have been completed yet.

## Next executable milestone
Build a read-only inventory/exporter for both repositories, produce a deduplication report, then import a small reviewed pilot batch as unpublished drafts. Submit follow-up PRs for verification hardening and validated import logic.
