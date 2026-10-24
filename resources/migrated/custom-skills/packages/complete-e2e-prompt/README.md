# complete-e2e-prompt

Master production engineering orchestrator for:

- github-e2e-setup
- docker-e2e-setup
- supabase-e2e-setup
- cloudflare-e2e-setup
- railway-e2e-setup
- zeabur-e2e-setup

The orchestrator discovers existing infrastructure, assigns one provider owner per responsibility, selects Railway XOR Zeabur for the normal production runtime, preserves production state, coordinates staging and immutable releases, verifies production, and establishes monitoring, backup, rollback, disaster recovery and maintenance.

Canonical instructions: `SKILL.md`.

This package contains no real credentials and must never be populated with secret values.
