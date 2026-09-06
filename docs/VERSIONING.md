# Versioning

Open-Connect uses **Semantic Versioning** (`MAJOR.MINOR.PATCH`).

| File | Role |
|------|------|
| `package.json` → `version` | Canonical app version |
| `VERSION` | Plain-text mirror for scripts / CI |
| `CHANGELOG.md` | Human-readable release notes |
| Git tag `vX.Y.Z` | Immutable source snapshot |
| GitHub Release | Public release notes + assets |

## Tagging a release

```bash
# on main, after version bump + changelog
git tag -a v1.0.0 -m "Open-Connect v1.0.0"
git push origin v1.0.0
# or create GitHub Release which creates the tag
```

## Environments

| Track | Branch / tag | Deploy |
|-------|--------------|--------|
| Production | `main` + latest `v*` tag | Cloudflare Pages `open-connect-app` |
| Staging | `development` (optional) | same project preview |

Domain production: **https://open-connect.site**
