# Marketplace automation

Open-Connect discovers public AI engineering, data engineering, MCP, agent, and developer-tool
projects as metadata-only candidates. Discovery never downloads or executes marketplace packages.

## Release flow

1. `Marketplace catalog sync` runs daily or by manual dispatch.
2. The collector queries the allowlisted source registry, normalizes URLs, deduplicates records, and
   classifies candidates.
3. The validator rejects unknown sources, duplicate or non-HTTPS URLs, invalid review states, and
   catalogs below the minimum completeness threshold.
4. GitHub opens or updates `automation/marketplace-catalog-sync` as a review pull request.
5. Merging that pull request triggers `Publish approved marketplace catalog`, which adds the exact
   reviewed snapshot to the Supabase review queue.
6. Only separately approved, verified resources may become installable or public marketplace tools.

## Review states

| State                     | Meaning                                                       |
| ------------------------- | ------------------------------------------------------------- |
| `pending_license_review`  | No usable SPDX license was reported.                          |
| `pending_security_review` | License metadata exists; security review is still required.   |
| `quarantined_metadata`    | Metadata matched a secret-like or executable-command pattern. |

## Operations

Run discovery and validation locally:

```bash
npm run marketplace:collect -- --write-catalog
npm run marketplace:validate
```

Required production secret: `SUPABASE_SERVICE_ROLE_KEY`, stored in the protected GitHub
`production` environment. GitHub Actions also needs repository workflow permissions to create pull
requests. Source changes belong in `config/marketplace-sources.registry.json`; every source must use
an implemented adapter and an explicitly allowlisted host.
