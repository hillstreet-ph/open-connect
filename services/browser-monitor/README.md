# Read-only browser cashout monitor

**Live monitoring requires operator activation.** This service polls an operator-verified cashout
listing and sends changes to a private Telegram forum topic. It has no payment/approval
functions, public HTTP listener, credential-fill endpoint, cookie export, or ChatGPT session
import. It does not implement the generic `agent-browser` action broker; do not point
`OC_BROWSER_WORKER_URL` at it. Run it as a dedicated long-running Open-Connect job.

## What is implemented

- One dedicated browser profile per project, identity and environment, under `/data`.
- Human sign-in in a protected operator desktop, then headless reuse of that profile.
- Origin, visible-account, loading/empty state, total-count and pagination checks.
- Exact PHP minor-unit comparison with an inclusive PHP 3,000 human-review threshold.
- Optional displayed promotion/VTO evidence; absent evidence and historical qualification
  remain unverified. No inference that an approved request has been paid.
- Durable SQLite snapshot/outbox, single-worker filesystem lock and restart recovery.
- Initial snapshot announces pending requests only, not the historical paid backlog.
- Dry-run mode; promotion of dry-run pending records to live delivery exactly once locally.
- Telegram topic ID on every send and destination verification of the provider response.
- Rate-limit delays, bounded retries and quarantine of uncertain sends (no exactly-once claim).
- Redacted local health file. No record bodies or provider error strings in stdout.

## Required activation inputs (not included)

1. A runtime with a protected operator desktop, persistent encrypted volume, and Chromium
   sandbox support. Keep one process/replica per volume. Cloudflare Pages is not this runtime.
   E2B sandbox health/create access alone is not worker command execution or persistence.
2. A private `monitor.json` derived from `config.example.json`, with **observed** selectors,
   exact account marker, verified all-status listing and source timezone, exact status map,
   verified chat/topic, and platform-approved polling cadence. Blank example values are
   intentional and startup rejects them. Never invent a selector or mark a mapping verified
   without comparing it to the actual UI. Set `mapping_verified=true` only after that check.
3. The intended bot token through a runtime secret file mounted read-only at
   `/run/secrets/telegram_bot_token`. Do not embed it in environment variables, image layers,
   build arguments, a URL stored in configuration, a repository, or a model prompt.
4. A **fresh profile established by the human operator**, not material exported from another
   restricted browser host. This service does not bypass native credential protection,
   CAPTCHA, MFA, rate limits, or sign-in refusals. Automatic password login is not implemented.

Existing Telegram delivery evidence and real destination IDs belong in the private setup
document/configuration, not this public repository. No production configuration is checked in.

## Operator handoff and verification

Before installing credentials, deploy the published image by digest with image arguments
`standby --data-dir /data`. The image already has `ENTRYPOINT ["python", "worker.py"]`;
for Docker/Compose, override only CMD/`command` with those arguments. For Zeabur's
explicit source fields, set `command: ["python", "worker.py"]` and
`args: ["standby", "--data-dir", "/data"]`. This performs a one-time non-root, writable-storage
and sandboxed Chromium check using a disposable **about:blank** profile, then keeps a
redacted `standby / operator_setup_required` heartbeat. It never opens KobePlay, reads
the production profile, sends Telegram messages, or enables itself when files change.
`python worker.py preflight --data-dir /data` performs the same check and exits.

The image's built-in HEALTHCHECK runs `python worker.py health --runtime-only` to
measure container readiness, including explicit standby. The default `health` command
deliberately fails in standby: a running container is not a working monitor. Use
`python worker.py health` as the separate monitoring-readiness check after activation.
Do not use Docker's runtime-only probe as a cashout monitoring SLA.
If Chromium sandbox initialization fails, stop the service and fix host compatibility;
never add `--no-sandbox`, run as root, or repeatedly restart it. Bind no public ports.
Keep secrets and player records out of the volume until its encryption and access controls
are verified. Standby confirms write access, not encryption or backup configuration.

Stop standby before the operator handoff below; it holds the single-worker lock.
After verified configuration and sign-in, explicitly replace the image arguments with
`run --data-dir /data` (preserve the entrypoint), and configure the separate monitoring
readiness check to run `python worker.py health` without `--runtime-only`.

Install requirements and Chromium in the authorized runtime. Keep runtime and login image
versions identical. Give UID 10001 exclusive access to the profile/state volume. Use the
provider's authenticated desktop and terminal; do not expose VNC, CDP, or an unauthenticated
browser endpoint to the Internet. Do not weaken the Chromium sandbox to make a host work.

With the poller stopped, launch the dedicated **headed** browser on that protected desktop:

```sh
python worker.py login --config /run/config/monitor.json --data-dir /data
```

The human signs in, handles MFA/challenges, opens the verified listing, then presses Enter
in the operator terminal. The worker verifies the visible identity and reads a complete
snapshot before writing a nonsecret verification marker. It never accepts a password argument.
An operator desktop is an external runtime requirement, not supplied by this headless image.

Validate the same profile and mapping without sending messages:

```sh
python worker.py check --config /run/config/monitor.json --data-dir /data
```

Inspect private records locally; do not attach the database or browser profile to a ticket.
Run with `live_enabled=false` until the source record count, sampled amounts, dates, statuses
and pagination match the backend. Verify the destination with a separately authorized setup
test and only then set `destination_verified=true` and `live_enabled=true` in private config.

```sh
python worker.py run --config /run/config/monitor.json --data-dir /data
```

`poll_seconds` defaults to 60 (allowed 30–3600). This is polling with detection latency of
at least the interval plus scan time, **not a webhook or a permanent session**. Provider
session expiry stops the worker with an explicit blocked health state. Do not configure an
unlimited restart loop around blocked authentication. A supervisor must notify the operator
from the redacted health state, including process exit and stale heartbeat; this external
health-alert wiring is not implemented by this worker. Human sign-in is required again.

## DOM mapping contract and limits

`listing_url` must be an observed HTTPS URL on the exact backend origin. `ready_selector`
must identify a fully loaded list, not a page shell. `total_selector` must yield only the
integer total for the whole chosen scope; `empty_selector` must be visible only for a real
loaded empty list. The account selector must yield exactly the configured username.

`fields` are row-relative text selectors. Required: request_id, username, amount, currency,
requested_at, status. Amount must be decimal text with optional correctly grouped commas;
currency must be literal PHP. Configure `timestamp_format` for a displayed date format or
leave null for ISO. Optional: promotion, promotion_status, promotion_vto, deposit_wagering,
completed_at. Multi-promotion detail pages and separate wagering tabs are **not implemented**;
omit those fields and show Unverified until an authorized dedicated adapter is validated.

Pagination follows only same-path links. It never clicks buttons or submits forms. If the
platform uses button-only pagination, currency symbols in amount cells, or a total such as
“1–20 of 100”, activation requires a tested adapter extension. The generic adapter fails
closed rather than pretending to support those layouts. A source row disappearing does not
mark a request completed. Changes observed between polls are not a complete historical audit.

## Persistence and recovery

Keep `/data` on encrypted, project-scoped persistent storage. Files include sensitive session
and request evidence and must never be public or used as build context. `.dockerignore`
allows only the five runtime source/dependency files. Back up the private volume with the
provider's approved encryption and retention controls; no backup system is enabled here.

`outbox.state=ambiguous` means Telegram may have delivered a message but acknowledgement is
uncertain. The worker halts delivery until a human reconciles that item against the topic.
There is deliberately no automatic replay or delete command. Retryable 429 responses respect
`retry_after`; permanent rejections halt. Historical `baseline` and `dry_run` rows are never
silently sent. Do not reset the database to solve a failure: that discards deduplication.

`health.json` has state, static reason code, check time and delivery counts, no player names.
The bundled Docker health check uses a 180-second freshness window; deployments with a longer
poll interval or slow scans must override that health-check window in their supervisor.

## Build, test and release

```sh
python -m pip install -r services/browser-monitor/requirements.txt
python -m unittest discover -s services/browser-monitor -v
python -m compileall -q services/browser-monitor
docker build -t open-connect-browser-monitor services/browser-monitor
```

The dedicated CI validates code, fixtures and container construction. Publication uses the
existing `hillstreet/open-connect` Docker repository, with isolated `browser-monitor-<SHA>`
tags, through the existing `container-publish` GitHub environment. No existing production
image tag is overwritten. Publishing an image is not deployment or proof of browser access.
Deploy the resulting immutable digest only after verifying the target runtime and secret
bindings. Rollback is to the previous digest with the same durable state volume, after stopping
the active worker. A database/profile restore is a separate operator-approved operation.

No frontend, DNS, Supabase schema/RLS, existing credential, or generic browser-broker security
policy is changed. Sentry/health-alert integration and live source verification remain pending.

Reference APIs: [Playwright persistent contexts](https://playwright.dev/python/docs/api/class-browsertype#browser-type-launch-persistent-context)
and [Telegram sendMessage](https://core.telegram.org/bots/api#sendmessage).
