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

| Check                               | Status and evidence                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Public website task and outcome     | Passed; linked native run completed, read Example Domain, followed its link, and reported IANA's final URL/heading |
| Read-only live preview              | URL delivery verified; iframe playback unverified; never label it manual takeover                                  |
| Profile setup and saved state       | API and mock regression coverage exist; no account sign-in or saved state was modified in this test                |
| Saved login reuse                   | Unverified; stored cookie counts do not establish valid authentication                                             |
| Separate-account isolation          | Personal key boundary regression tests exist; live multi-account isolation unverified                              |
| Expired-login repair                | Unverified; native per-run Vault selection is not implemented                                                      |
| Unsupported MFA handoff             | Not tested; no MFA or CAPTCHA automation attempted                                                                 |
| Disconnect and duplicate submission | Poll recovery regression tests exist; durable submission reconciliation still required                             |
| Async cancellation                  | Exposed by native adapter; live cancellation not tested here                                                       |
| Webhook retries and deduplication   | No native webhook ingestion/verification/deduplication acceptance completed                                        |
| Evidence retrieval                  | Final text result verified; screenshot/HTML/recording retrieval unverified                                         |
| Proxy schema validation             | Country-code normalization tested; live proxy behavior unverified                                                  |
| Provider/account errors             | Existing error handling and mock coverage; insufficient funds/rate-limit scenarios unverified live                 |
| Profile/domain deletion             | Not implemented in the native profile UI; no saved state was deleted                                               |
| Completion claims                   | Report only the above observed outcomes; a provider COMPLETED status alone does not establish business success     |

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
