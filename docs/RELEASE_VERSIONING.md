# Release Versioning and Tags

Use semantic versioning for Open Connect releases:

- `vMAJOR.MINOR.PATCH` for tags
- Keep `CHANGELOG.md` updated before cutting a release
- Tag only after the PR is merged and Railway health has been verified
- Use release notes to summarize:
  - startup/health fixes
  - backup/restore changes
  - workspace bootstrap changes
  - security or data-safety changes

## Current guidance

- `1.0.0` is the initial Open Connect release
- `1.0.1` is the next maintenance release for workspace bootstrap and backup resilience
- Future agents should avoid creating a tag until the deploy is confirmed healthy on Railway
