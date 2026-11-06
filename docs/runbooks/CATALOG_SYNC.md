# Agent-platform catalog sync

The hourly `Agent platform resource sync` workflow reads resource-manifest metadata from six required upstream sources. It does not install or execute upstream packages. An incomplete required-source snapshot must fail before the committed catalog is changed or a review PR is opened.

For failures, inspect the source ID, HTTP status and upstream message in the discovery step. The failure report also lists coverage and source errors without printing candidate contents or credentials. Manual dispatch on a feature branch supports isolated diagnostics; creation of the catalog review PR remains restricted to `main`.

## Mistral runner restriction

On November 6, 2026, GitHub-hosted runners could read Mistral repository metadata, but the recursive tree API returned HTTP 403 because the upstream organization IP allowlist did not permit that runner. Remaining rate-limit capacity ruled out primary rate exhaustion. Evidence and the required external action are tracked in [issue #849](https://github.com/hillstreet-ph/open-connect/issues/849).

This requires an upstream-approved runner/network or supported authorization change. Do not use alternate tokens or anonymous fallback to evade the restriction, remove the required-source check, or publish an incomplete snapshot. A successful collection from another authorized environment does not prove that scheduled Actions access is repaired.

After authorized access is restored, dispatch the workflow on `main`. Verify all six selected sources succeed with no collection errors, validate the generated candidates, review their metadata-only PR, require CI, merge normally, and verify the exact production commit. Candidates remain unverified and non-installable until their separate review requirements are satisfied.
