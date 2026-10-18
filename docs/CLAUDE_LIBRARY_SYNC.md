# Claude library sync

Open-Connect keeps a metadata-only catalog of the skills and plugins available to the owner's
Claude account (Cowork, Claude Code, claude.ai) so agents on any host can select them, and so
the Open-Connect library can show what already exists before anything is duplicated.

## What is synced

| Source                       | Location scanned                                                 | Catalog kind    |
| ---------------------------- | ---------------------------------------------------------------- | --------------- |
| Claude account skills        | `~/.claude/skills/synced/*/**/SKILL.md`                          | `account_skill` |
| Claude plugins (marketplace) | `~/.claude/plugins/synced/*/<plugin>/.claude-plugin/plugin.json` | `plugin`        |

Each record holds slug, name, description (280 chars max), declared or detected license, a content
fingerprint over every file, file count, marketplace, plugin skill names, MCP/command/agent presence, and
`duplicate_of` — the existing Open-Connect resource slug when one already covers it.

The catalog does **not** vendor skill bodies, plugin code, or MCP configuration. Third-party
plugin content stays with its upstream marketplace and license; bodies are served only through
the existing reviewed pipelines (`docs/VENDORED_SKILLS.md`) or private library uploads.

## Pipeline

```
~/.claude/skills/synced, ~/.claude/plugins/synced
        │  npm run claude-library:sync
        ▼
config/claude-library/index.generated.json         # policy, counts, shard list
config/claude-library/resources-NN.generated.json  # metadata only, one resource per line, ≤ 40 KiB
        │  PR → required checks → main
        ▼
Open-Connect library resource `claude-skills-plugins-catalog` (private, review required)
```

- `config/open-connect-library.snapshot.json` is the library slug and name snapshot used for
  `duplicate_of` (matched by slug or declared name, also against
  `config/vendored-skills.generated.json`); refresh it from `list_resources` when the library
  changes. A missing or malformed snapshot, or a missing default source root, aborts the sync
  so a partial scan never overwrites the catalog.
- `npm run claude-library:validate` fails on a schema mismatch, any policy field that would
  allow installation, publication or skipped review, a bad or duplicate slug, an invalid review
  state, or secret-like metadata. `scripts/sync-claude-library.test.mjs` runs in
  `npm run test:registry`.
- Every text file in a skill or plugin (not only `SKILL.md`) is scanned; a match records the
  resource as `quarantined_metadata` with its description removed. Placeholders such as `xoxb-YOUR-TOKEN` also trigger it; that is intentional.

## Autonomous setup

`skills/claude-autonomous-e2e/SKILL.md` is the orchestrator skill that uses this catalog together
with `skills/auto` and Open-Connect discovery to complete a goal end to end: frame → discover →
plan by risk tier → execute → verify → report. It is published to the library as
`claude-autonomous-e2e-setup` (private until reviewed).

## Review and publication

Nothing here installs or publishes automatically. Library resources are created private and
unverified; publishing requires independent security review and explicit owner approval.
