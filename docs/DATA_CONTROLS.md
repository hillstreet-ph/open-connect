# Data Controls

Open **Settings → Data Controls** (`/settings#data`) for account-wide settings.
Controls are private to the signed-in account. Other accounts opt in independently.

- **Activity capture** indexes identifiers for saved Memory, Knowledge, owned resources, Toolkits and verified capability runs. Enabling it also syncs existing records within the retention period.
- **Helper memory** automatically saves a redacted interaction summary after an Agent-Helper reply. Assistant responses remain explicitly unverified.
- **Draft suggestions** create one private workflow draft after three distinct verified runs of the same capability. Duplicate events for the same run do not increase its count.
- **Retention** is 30, 90 or 365 days. The existing authenticated background scheduler removes expired activity and automatically captured context. Manually saved context and Studio drafts remain until deleted.
- **Export** downloads owned context, activity, drafts, resource metadata and Toolkit metadata as JSON. It paginates through all records and fails instead of delivering a partial result. Common secrets are redacted; credentials and binary attachments are excluded.

In **Studio → Reusable drafts**, edit a prompt, skill, guide or Toolkit blueprint, then choose **Build for review**. Builds are atomic and retry-safe. They produce a private, unverified resource. Complete its source, license, dependency and security review through the existing resource review flow before publishing. A Toolkit blueprint is a resource specification, not an automatically installed set of tools.

Activity counts cover the latest 200 indexed records; the export includes the full retained index. These controls do not passively read conversations in other apps or compact a host application's history. Explicit MCP checkpoint and run-outcome tools continue to save the context the calling client supplies.

## Verification

Run `bun run test:control`, `bun run test:navigation`, `bun run lint`, `bun run typecheck`, `bun run build` and `bun run test:ssr`.

For the database regression script, set the PostgreSQL session setting `open_connect.test_user_id` to an existing test-account UUID, then execute `supabase/tests/account_data_controls.sql`. It tests distinct-run counting, draft deduplication, private idempotent builds, retention and cross-account row isolation. All test writes roll back.
