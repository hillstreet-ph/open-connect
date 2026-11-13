# github-e2e-setup

Portable GitHub E2E skill for AI engineering agents.

## Modes

- Fork + ongoing upstream synchronization
- Independent clone
- Import/migration
- Uploaded ZIP/folder
- Generated/new source
- Existing GitHub repository
- Existing production repository

## Core lifecycle

`development → staging → main → production`

Fork mode adds:

`upstream → upstream-sync/* → development`

## Common provider composition

- GitHub: release control plane
- Docker Hub: registry
- Supabase: DB/Auth/Storage
- Cloudflare: DNS/TLS/edge
- Railway **or** Zeabur: runtime

The skill does not require all providers. It detects and uses only what is applicable.

## Installation

Place the `github-e2e-setup` folder in the skill/instructions location supported by your AI agent. The canonical instructions are in `SKILL.md`. If a platform does not support skill folders directly, use `prompts/MASTER_PROMPT.md`.

## Safety

Never store real secrets in this package. Configure secrets through provider secret stores or authorized connector tools.
