# GitHub App authentication

Open-Connect automation uses installation tokens issued at runtime. Personal access tokens and the
default workflow token are not used for repository mutations.

## Repository secrets

Configure these encrypted Actions secrets:

- `OPEN_CONNECT_GITHUB_APP_ID` — the numeric ID of the installed `connect-open` GitHub App.
- `OPEN_CONNECT_GITHUB_APP_PRIVATE_KEY` — the complete PEM private key for that App.

Do not commit the PEM, upload it as an Actions artifact, or place it in workflow output. Install the
App only on the repositories it must operate.

## Minimum repository permissions

| Permission | Access | Purpose |
|---|---:|---|
| Metadata | Read | Required by GitHub Apps |
| Contents | Read and write | Checkout, promotion branches, tags, controlled redeploy commits |
| Pull requests | Read and write | Open/update promotion PRs and review comments |
| Issues | Read and write | Hourly audit and production incident lifecycle |
| Checks | Read | Confirm required CI before promotion |
| Actions | Read | Link and inspect workflow evidence |

No administration, secrets-management, organization-management, or member-management permission is
required. Branch protection and production environment approval remain enabled.

## Installation validation

After saving the secrets and installing the App on `hillstreet-ph/open-connect`:

1. Run **Hourly autonomous audit** manually.
2. Confirm the `Create GitHub App token` step succeeds.
3. Run **PR — Reviewer** on a test pull request and confirm one review comment is created.
4. Run **Merger — development to main** and confirm it opens or updates a PR without merging it.
5. Run **Release** only after protected production checks pass.

The `box-open` key belongs to a different App boundary and must not be configured in this repository.
