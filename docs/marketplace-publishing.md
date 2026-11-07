# Marketplace publishing

This repository doubles as an installable skill catalog for the OpenClaw and Hermes agent ecosystems. Every folder containing a SKILL.md under `skills/` (including vendored skills) is publishable and installable. Ownership stays with the hillstreet-ph GitHub organization.

## Install from Hermes

The repository is a Hermes tap. The `hermes skills tap add` command defaults to the `skills/` path, which matches this repository layout exactly:

```bash
hermes skills tap add hillstreet-ph/open-connect
hermes skills search open-connect --source github
```

Users can also install a single skill from the repository without adding the tap:

```bash
hermes skills install hillstreet-ph/open-connect/skills/open-connect-control
```

The root `skills.sh.json` file provides category groupings shown on the Hermes Skills Hub.

## Install from ClawHub / OpenClaw

Once published, skills are installable through ClawHub (clawhub.ai), the registry behind the OpenClaw skills marketplace:

```bash
openclaw skills search "open-connect"
openclaw skills install @hillstreet-ph/<skill-slug>
```

## Publish to ClawHub

Publishing is automated through the [marketplace skill publish workflow](../.github/workflows/marketplace-skills.yml). First-party and vendored root skills go through ClawHub's official reusable skill-publish workflow; the vendored OpenClaw folders are published by a dedicated job that drives the ClawHub CLI directly. It covers every skill folder in this repository:

1. `skills/` root: the seven first-party Open-Connect skills.
2. `skills/vendor/`: vendored root skills (nexu-open-design, openrouter-models).
3. `skills/vendor/openclaw/skills/`: the vendored OpenClaw skills.
4. `skills/vendor/openclaw/agents/`: the vendored OpenClaw agents.
5. `skills/vendor/openhands-extensions/`: the vendored OpenHands extensions.

### One-time setup

1. Install the ClawHub CLI: `npm i -g clawhub`.
2. Authenticate with your GitHub account: `clawhub login`.
3. Copy the token from the ClawHub CLI config (`~/.config/clawhub/config.json` or the path reported by `clawhub whoami`).
4. Add it as the `CLAWHUB_TOKEN` secret in the repository settings (Settings, Secrets and variables, Actions, New repository secret).

### Publishing

1. Open Actions, Marketplace skill publish, Run workflow.
2. Leave dry_run enabled for a preview, or disable it for a real publish.
3. Set the owner to the ClawHub publisher handle (`hillstreet-ph`) when publishing to an organization owner.
4. Categories and topics apply to every skill in the run; use skill_path to publish a single skill.

Vendored skills whose slugs already exist on ClawHub under another owner will be reported in the run output and skipped by the registry; the first-party publish job is unaffected.
ClawHub reserves certain slug namespaces: the slug 'clawhub' outright, and any slug starting with 'openclaw-' or ending with '-clawd'. Because the registry derives the publish slug from the folder name, the vendored publish job passes an explicit override slug for those folders ('oc-' prefix, for example 'oc-testing'; 'oc-clawhub'; 'discord-clawd-agent'). Repository folder names and SKILL.md frontmatter stay unchanged, so Hermes installs and the vendored catalog are unaffected.


### Validation

Every run first validates that each SKILL.md has a lowercase slug-compatible name and a description, and that `skills.sh.json` references only existing skills. A validation failure stops the run before anything is published.

## Publish to Hermes

No submission is required for the tap: the repository is already installable through `hermes skills tap add hillstreet-ph/open-connect`. Publishing a skill into the Hermes centralized index can additionally be done from a machine with the Hermes CLI:

```bash
hermes skills publish skills/open-connect-control --to github --repo hillstreet-ph/open-connect
```

## Optional OpenHands skills

The vendored `skills/vendor/openhands-extensions/uv` skill is rejected by the ClawHub publish CLI in its current form, so the `publish-vendor-openhands` job only runs when the dispatch input `include_openhands` is enabled. To retry it later, run "Marketplace skill publish" with `include_openhands` on (or use `skill_path: skills/vendor/openhands-extensions/uv`); the exact ClawHub error is printed in that job log.

## Providing the ClawHub token

Real publishing requires a ClawHub API token. Two options exist:

1. Repository secret (recommended): add the token under Settings, Secrets and variables, Actions as CLAWHUB_TOKEN. All publish jobs then work with no further input.
2. Dispatch input: run "Marketplace skill publish" and fill the optional clawhub_token input. The value is used for that run only and is never printed in logs; the workflow falls back to the repository secret when the input is empty.

The token is never committed to the repository. GitHub dispatch inputs are visible only to users with write access to the repository.
