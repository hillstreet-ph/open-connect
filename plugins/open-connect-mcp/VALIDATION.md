# Release validation and remaining gates

Validated locally on 2026-10-27 against the current repository checkout:

- Dependency installation using the existing frozen Bun lockfile and Playwright-worker npm lockfile.
- Full `bun run test` command completed successfully before the final widget-only additions. All 59 MCP execution tests passed after resource URI versioning. After adding session follow-ups, all 17 widget tests passed.
- Production build and strict TypeScript validation passed. Full lint passed with 56 existing warnings; changed-file lint passed after the final edits.
- SSR smoke checks rendered the eight configured routes successfully.
- Chromium checks at 320px, 390px and 1024px verified six cards, collapsed advanced controls, working prompt selection and no horizontal overflow when collapsed or expanded.

The widget uses resource URI v7 and still serves v6 and earlier resource URIs. Three presets populate the goal without invoking tools. Auto state and worker availability remain permission-aware; shortcuts use existing application routes.

Session follow-up buttons use the current widget goal and whether the response came from discovery or workers. Selecting one fills the widget's editable goal without sending or executing it. These are deterministic recommendations, not trained-model improvements or retrieval from unshared host conversations. Discovery, proposal receipt and blocked tasks have separate status labels. The widget cannot detect that the entire host conversation has ended or edit the host chat composer through an unsupported API.

Existing shared-exchange capture and verified-run learning have automated tests. Exchange capture obeys account Data Controls, redacts common secrets and deduplicates saved exchanges. It cannot read a host's unshared history. Repetition prepares private unverified drafts; it does not approve or publish them. Uploaded files need the actual supported storage/upload path and account authorization.

Publication is incomplete:

- The Cloudflare connector returned UNAUTHORIZED and explicitly requires reconnection. No production deployment was attempted through another identity.
- Plugin Creator update returned RPC INTERNAL. Read-back still showed canonical plugin version 1.1.0, release `pluginrel_6ad2fce4465c81919ba2098eec6645ec`, without the two added skills.
- Build validation uses the CI placeholder Supabase publishable key. Production must use the existing deployment's real configured public key; do not deploy the validation build as a replacement for that configuration.
- No plugin uninstall, source merge, public Marketplace publication or new permission grant was performed. Keep the working connections until the updated canonical package is saved and verified.

Instructions and catalog entries do not implement missing APIs, grant administrator permissions, provision cloud devices or install connections into other AI clients. A full-operation readiness claim requires testing the actual account, operation, host and executor for each requested feature.
