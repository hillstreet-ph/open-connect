# credentials-e2e-setup

Autonomous credential/secret/environment-variable orchestration for authorized applications.

Core behavior:
- discover and reuse valid credentials
- create real provider-issued credentials when authorized and supported
- securely generate application-owned secrets when required
- store values directly in authorized secret stores
- configure consumers
- validate real provider operations
- avoid unnecessary revocation/rotation
- never fabricate production credentials
- never print reusable secret values in reports

Canonical instructions: `SKILL.md`.
