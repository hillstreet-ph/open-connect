# OpenClaw install requests

This registry catalogs operator-requested `openclaw plugins install` and
`openclaw skills install` commands as marketplace entries so every request has a
reviewed, traceable disposition.

## Policy

Requested packages are cataloged in `config/openclaw-install-requests.registry.json`
as metadata-only entries. Open-Connect never downloads, executes, or auto-installs
registry packages, and CI never runs the recorded install commands. Every entry
starts in `review_required` and must pass license verification and a separate
security review before it can become installable, exactly like the vendored
upstream skills and curated resources.

## Resolution rules

| Source type                   | Request form                | Canonical URL                                    |
| ----------------------------- | --------------------------- | ------------------------------------------------ |
| `clawhub_registry`             | `owner/name`                 | `https://clawhub.ai/<owner>/plugins|skills/<name>` |
| `openclaw_registry_package_name` | unqualified `name@latest`    | none; resolve the publisher at review time        |
| `github_repository`            | `@file:`owner/repo``          | `https://github.com/<owner>/<repo>`                |
| `skills_sh`                    | `skills-sh:<path>`           | `https://skills.sh/<path>`                       |

Duplicate requests are consolidated into a single catalog entry and recorded in
the registry's `duplicate_requests` section so the original request count stays
auditable. Requests that match an already-curated resource, such as
`wlshlad85/superpowers`, are cross-referenced in the registry notes instead of
creating a second curated row.

## Operations

`src/lib/openclaw-install-requests.test.ts` enforces the registry invariants in CI:
unique `open-oc-` slugs, exact install-command syntax, documented source resolution,
HTTPS-only canonical URLs, metadata-only policy flags, and consolidated duplicates.

## Review gate

This catalog is generated from the operator's install requests and is inert until each entry passes license verification and security review.

Failed validation runs do not change any entry state; entries stay inert metadata until each review completes.
