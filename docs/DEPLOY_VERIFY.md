# Deploy verification — production must match `main`

The gate in `scripts/verify_production_deploy.py` answers one question with
evidence: **is the commit running at open-connect.site the commit that is on
`main` right now?** It runs after every push to `main`
(`.github/workflows/deploy-verify.yml`) and on demand.

It checks four things:

| Check | What it proves |
|---|---|
| Commit identity | `/build-info.json` reports the same SHA as `main` HEAD |
| Roster pages | all 9 roster pages return their own HTML, not the SPA shell |
| Export URLs | the per-agent export URLs resolve |
| MCP endpoint | `/ai-factory/mcp` answers `initialize`, `tools/list` and all three tools |

Exit codes: `0` production matches main, `1` it does not, `2` bad usage.

## Optional: naming the superseding build

When production does **not** match `main`, the gate can say *which build
superseded it* — its commit, build status, created time and deployment URL.
This is diagnostic enrichment. It is **optional**, and its absence is never a
failure.

### Secret names

Set these as **repository secrets** (Settings → Secrets and variables →
Actions → New repository secret):

| Secret | Required | Value |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | optional | a Cloudflare API token with **Pages: Read** |
| `CLOUDFLARE_ACCOUNT_ID` | optional, needed with the token | the account that owns the Pages project |
| `CLOUDFLARE_PAGES_PROJECT` | optional | project name; defaults to `open-connect-app` |

Both `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` must be present for the
lookup to run. With only one of them the gate reports which one is missing and
carries on.

### Minimum token scope

Create the token at **Cloudflare dashboard → My Profile → API Tokens → Create
Token → Custom token**:

- **Permissions:** `Account` → `Cloudflare Pages` → **Read**
- **Account resources:** include → the account that owns `open-connect-app`
- **Zone resources:** none
- **Client IP address filtering:** optional

That is the whole scope. The gate only ever issues `GET` against
`/accounts/{account_id}/pages/projects/{project}/deployments`. It does not
create, retry or cancel deployments, and it does not read any other resource.
Do **not** use a Global API Key, and do not grant Pages: Edit — the gate has no
write path.

### What it reports

With a token, on a mismatch, the failure detail gains one sentence:

- **A build for `main` HEAD exists** → it is named:
  `Superseding build: commit 73376d6b1c is succeeded (created 2026-11-10T21:00:00Z), deployment https://abc123.open-connect-app.pages.dev.`
- **No build for `main` HEAD exists** → the gate says the build never started
  and names the newest production deployment instead. This is a different fault
  from "it built and lost the race", and the two are reported differently on
  purpose.
- **The API cannot be reached or rejects the token** → the gate says
  `Build-level detail unavailable: <reason>` and the verdict is unchanged.

Without a token the gate prints
`verify: cloudflare build detail=unavailable (no Cloudflare API token is configured …)`
and behaves exactly as it did before this feature existed.

### Token handling

The token is read from the environment only — never hardcoded, never committed.
It is placed in an `Authorization: Bearer` header and nowhere else: not in the
request URL, not in a log line, not in the job summary, not in the
`deploy-drift` issue body. Every string the lookup returns is passed through
`redact()` before it can be printed, so an error body that echoes the token back
comes out as `[redacted]`.

### Disabling it

Pass `--no-cloudflare` to skip the lookup entirely, even when the secrets are
set. Useful when debugging the gate itself.

## Tests

Both suites are offline and run in the required **Build & validate** check:

```bash
python3 -m unittest discover -s scripts -p 'verify_production_deploy_test.py' -v
python3 -m unittest discover -s scripts -p 'cloudflare_pages_test.py' -v
```

`cloudflare_pages_test.py` covers the four states the lookup can be in — token
present with a superseding build, token present with none, token absent, and API
error responses (401/403/500, `success: false`, malformed payload, transport
error) — plus the property that the token never appears in any printable string.

**The token-backed path is verified against mocked responses only.** It has not
been exercised against the live Cloudflare API, because no token is configured.
Once the secrets above are set, the next failing deploy verification run will
exercise it for real.

## Related

- `docs/CLOUDFLARE_PAGES_BUILD.md` — build settings for the Pages project
- `.github/workflows/redeploy-cloudflare-pages.yml` — force a rebuild via a
  deploy hook (`CF_PAGES_DEPLOY_HOOK`)
