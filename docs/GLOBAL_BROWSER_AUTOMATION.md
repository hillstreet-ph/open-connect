# Global browser automation

The Cloud Browser page has one global automation policy. Verification is no longer
a selectable resource in Connected Tools. The shared toolkit is
`config/global-browser.toolkit.registry.json`; the bundled client procedure is
`skills/open-connect-global-browser/SKILL.md`. These resources are versioned in this
repository, not silently installed into third-party AI accounts.

## Provider behavior

| Browser           | Controls and assistance                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Direct TinyFish   | Pointer, click/drag, scroll, tabs, keyboard, paste, masked input; optional shared widget detection and proof application on the same CDP target  |
| Browser Use       | Agent tasks, live view, cost limits and cancellation; provider-managed automatic verification in agent runs                                      |
| Browserbase       | Supported manual live view, status and release; new sessions inherit the global native-assistance flag unless the caller explicitly overrides it |
| Connected workers | Discovered provider controls; common resolver tools available to authorized AI clients capable of applying a proof in their existing browser     |

A common API does not add unsupported capabilities to a provider. Browserbase
assistance is requested when creating a session. A new browser does not resume
an existing agent run. Use the same session's interactive view for unresolved
challenges and normal sign-in/MFA handoff.

## Common tools

- `browser_automation_status`: owner policy, credential metadata and capability boundaries.
- `browser_automation_configure`: save owner policy, requiring `control:write`.
- `browser_verification_start`: create or resume one idempotent paid request.
- `browser_verification_result`: poll the owned attempt and return an ephemeral proof.

All tools require personal user context. Paid tools require provider-write access;
project/workspace keys cannot access a personal solver credential. Start requires
both saved global external-assistance consent and `spendApproved: true`. Keys are
resolved server-side from the owner's existing credential store; prompts never
contain provider keys. The provider endpoint is fixed and redirects are rejected.

Save one 2Captcha API key in Credentials with website `https://2captcha.com` and
optionally tag `provider:two_captcha`. Conflicting provider tags are excluded;
multiple matching keys block submission until one canonical key remains. No key
was available during implementation, so external live solving is unverified.
The global default for paid external assistance is off.

Supported external tasks are proxyless reCAPTCHA v2 and Turnstile widgets with a
site key. Managed Cloudflare challenge pages requiring action/cData/pageData,
enterprise/invisible variants, image puzzles and extension-only flows are not
implemented. Some sites require callbacks or additional provider-specific context;
filling an existing response field does not prove that a site accepted a token.

Direct control probes only the widget metadata. It submits at most one request
per widget in a session target using a stable request ID, including across UI
remounts. It checks the CDP target generation, origin and site key before applying
proof; navigation or tab changes abort application. No form is auto-submitted.
Other clients must enforce the same binding. The server cannot independently
attest a remote worker's browser state. Proofs are returned transiently, never
stored in attempt history, logs or task prompts. Verify website acceptance after
application. An unresolved or stale widget uses same-session handoff.

The database reserves each request ID before contacting the provider. Reusing an
ID with different context is rejected. A transport failure becomes
`submission_unknown`; it is never automatically resubmitted. Poll at least five
seconds apart; attempts expire after ten minutes. Attempt metadata is owner-only.
Do not retry with a new ID when submission or acceptance is uncertain.

## Source compatibility

- [Browser Use verification](https://browser-use.com/captcha-solving)
- [2Captcha createTask](https://2captcha.com/api-docs/create-task)
- [2Captcha getTaskResult](https://2captcha.com/api-docs/get-task-result)
- [reCAPTCHA v2](https://2captcha.com/api-docs/recaptcha-v2)
- [Turnstile](https://2captcha.com/api-docs/cloudflare-turnstile)

Agent Captcha is an agent-verification demo. CaptchaSonic is a browser extension
whose hosted compatibility is unverified. The local Selenium 2Captcha MCP demo is
not installed into cloud browsers. The implementation uses the provider's hosted
API rather than creating duplicate solver connectors or installing vendor code.
