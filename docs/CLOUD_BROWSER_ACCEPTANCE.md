# Cloud browser acceptance status

Checked 2026-10-25 (Asia/Manila). This records observed results, not a guarantee that every website works.

## Verified live

- Composio `tinyfish` account and Open-Connect native browser both list two Browser Context Profiles.
- The native public-site test completed with the requested page titles/headings and navigation to IANA.
  [Run evidence](https://open-connect.site/cloud-browser?run=b25e1639-5baa-46dc-b8d5-d688e9c0d158)
- The public-site run returned a live streaming URL while running. Interactive preview playback was not manually verified.
- A native direct Browser API session was created, returned a CDP connection, and was explicitly closed.
  CDP navigation, screenshots and inspector interaction were not tested in this check.
- Wallet and current rate metadata were accessible through Composio. No top-up or auto-reload was enabled.

## Acceptance matrix for the supplied implementation brief

| Check                               | Status and evidence                                                                                                              |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Public website task and outcome     | Passed; linked native run completed, read Example Domain, followed its link, and reported IANA's final URL/heading               |
| Read-only live preview              | URL delivery verified; iframe playback unverified; never label it manual takeover                                                |
| Profile setup and saved state       | API and mock regression coverage exist; no account sign-in or saved state was modified in this test                              |
| Saved login reuse                   | Live GitHub check reached /login with authenticated=false; profile attachment worked but its GitHub login state requires renewal |
| Separate-account isolation          | Personal key boundary regression tests exist; live multi-account isolation unverified                                            |
| Expired-login repair                | Unverified; native per-run Vault selection is not implemented                                                                    |
| Unsupported MFA handoff             | Not tested; no MFA or CAPTCHA automation attempted                                                                               |
| Disconnect and duplicate submission | Poll recovery regression tests exist; durable submission reconciliation still required                                           |
| Async cancellation                  | Exposed by native adapter; live cancellation not tested here                                                                     |
| Webhook retries and deduplication   | No native webhook ingestion/verification/deduplication acceptance completed                                                      |
| Evidence retrieval                  | Final text result verified; screenshot/HTML/recording retrieval unverified                                                       |
| Proxy schema validation             | Country-code normalization tested; live proxy behavior unverified                                                                |
| Provider/account errors             | Existing error handling and mock coverage; insufficient funds/rate-limit scenarios unverified live                               |
| Profile/domain deletion             | Not implemented in the native profile UI; no saved state was deleted                                                             |
| Completion claims                   | Report only the above observed outcomes; a provider COMPLETED status alone does not establish business success                   |

## Startup timeout correction

Direct browser creation can take 10–30 seconds. TinyFish requires at least a 60-second client timeout:
https://docs.tinyfish.ai/browser-api/reference

Use a 60-second request deadline for direct browser and profile setup creation. Keep ordinary API
reads bounded to 25 seconds. The browser's inactivity lifetime is separate from this HTTP deadline.
An uncertain creation response must not be interpreted as proof that a provider session was never created.

## Remaining integration work

The supplied brief also requires native Agent request controls for explicit Vault-item selection,
structured output, step/capture budgets; direct CDP UI/control; durable job/run recovery; authenticated
completion callbacks; account mapping; browser-job schedules; retention/export/deletion; and distinct
Search/Fetch/Research/Monitor integration. These must remain unverified until implemented and tested.
No upstream SDK was installed, no credentials were exported, and no visibility was widened.

## Saved-login check

[GitHub profile run](https://open-connect.site/cloud-browser?run=3efa4d25-ed76-4c7c-9a2f-8d87301aba08)
attached the selected saved profile, completed in three steps, and returned `authenticated: false`,
`https://github.com/login`, and `Sign in to GitHub`. This is a completed diagnostic with a failed
login-reuse outcome, not proof of a valid saved login. Renew GitHub sign-in in profile setup and save
before rechecking. No credential injection, login attempt or account settings change was made.

## Direct-control follow-up

A direct-control UI now connects the signed-in user's browser to the provider's private CDP session.
It supports live frames, clicks, wheel scrolling, address navigation, remote keyboard input, mobile
masked text entry, reconnecting the same session, explicit closure, and profile setup save/discard.
The Agent iframe remains observation only. The screenshot's `authenticated: false` diagnostic is
shown as sign-in required rather than authenticated success. A finished run's closed preview is
explained beside the result. Profile save failures are reported by domain; closure is explicit.

Live protocol acceptance from a Chrome page at the Open-Connect origin received 18 frames, inserted
and deleted fixture text, clicked a temporary test control, and followed Example Domain's link to
`https://www.iana.org/help/example-domains`. All temporary sessions were closed. This exercised
browser-origin WebSocket access and the same CDP controller used by the UI. A real account login,
profile save/reuse after login, and interactive checks on every website remain unverified.

Typed values, live frames and CDP URLs stay in ephemeral frontend state and are not written to
local storage or run history. Leaving the page disconnects the controller and attempts cleanup;
network interruption can leave a session running until provider expiry, so explicit Close remains
necessary. Direct sessions have a five-minute inactivity timeout; profile setup expires after
15 minutes. These are separate from the 60-second startup request deadline.

The pending approvals page and dependency/workflow PRs were integrated for combined validation.
TanStack Start was aligned to 1.169.3 to match the router 1.170.45 upgrade; the prior pair installed
two router copies and failed server-route type checks. Duplicate approval-route registration was
removed and the existing expiry clock retained. Dependency audit, full tests, strict typecheck,
build, SSR, consolidated-resource integrity and production-health contract tests are required.
