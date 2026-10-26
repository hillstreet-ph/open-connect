# Additional browser providers

TinyFish remains the existing cloud browser and profile integration. Cloud Browser now also has a Browser Use V4 agent and a Browserbase manual-session panel. These SDK integrations do not replace TinyFish or claim that legacy MultiOn APIs are working.

## Connect and execute

1. Open Connections, choose Browser Use V4 or Browserbase, and save your provider API key in the native credential form. The key is encrypted in the existing vault. Validation only reads Browser Use billing/account metadata or Browserbase projects; it does not start a browser or purchase credits.
2. Open Cloud Browser and find Browser Use and Browserbase. Browser Use executes the supplied task. Browserbase starts a manual browser; it is not an autonomous task runner.
3. Approve each metered run explicitly. Browser Use sends `maxCostUsd: 1`; model and modelParams are omitted unless explicitly supplied through the API. This retains the provider's current default and compatible Bedrock defaults. Explicit model settings are preserved. Browserbase uses a 300-second timeout, no proxies, no Verified mode, and no automatic CAPTCHA solving. No project-ID variable is required.
4. Keep the returned reference. This tab saves it in sessionStorage for reload recovery. Closing the tab does not cancel a provider job. Use Stop/cancel for abandoned runs and verify status. Browser Use terminal reads stop only browsers belonging to that new agent session and check the stop response. Browserbase release is checked through a subsequent status read. Provider dashboards remain the recovery path when a request's outcome is uncertain.
5. Review the result against the requested goal. `completed` without a result is not treated as successful extraction. This integration does not guarantee correctness on every website.

Creates are not automatically retried by either SDK or UI. This prevents retries after an ambiguous timeout, but is not durable idempotency across tabs, clients, or process restarts. Check the provider dashboard before creating again if submission was not confirmed. A response lost before the signed reference arrives must be reconciled there. The integration does not list all account runs in the application.

## ChatGPT and MCP

Refresh the tool catalog at `https://open-connect.site/mcp`. `browser_provider_start`, `browser_provider_read` and `browser_provider_stop` require a personal administrator key with `tools:invoke`. Start additionally requires `spendApproved: true` after the host/user approves this specific metered run. The entire signed start response is the input to read and stop. Read is marked write-capable because it cleans up terminal browsers. Scoped organization/workspace/project keys cannot use these account-level providers.

Credentials are resolved server-side for the caller's own connection. Signed references bind the caller, provider, connection, run and session IDs and reject tampering. API keys, CDP credentials and raw upstream error responses are not sent to the browser. Rotating/removing a key invalidates its old references: stop outstanding work first or use the provider dashboard.

For an operator-owned installation, server-only BROWSER_USE_API_KEY or BROWSERBASE_API_KEY is supported when BROWSER_PROVIDER_OWNER_ID exactly matches the authenticated caller. Set these in the runtime's secret store, never in VITE variables or committed files. Each deployment runtime needs its own bindings. Native per-user vault connections do not require these deployment keys.

## BrowserAct and MultiOn

The official BrowserAct discovery skill was installed in the user's skill workspace; browser-act-cli 1.4.5 installed successfully. Verification here fails at `get-skills core --skill-version 2.0.2` with error 230305, command daemon not ready after 30 seconds. This environment therefore has no verified BrowserAct-controlled browser. The local CLI needs a compatible isolated worker with persistent profiles; it cannot run as a process inside a Cloudflare request. Do not advertise it as connected. Load the current official skill before creating a browser and retain its confirmation gates for login, forms, uploads and challenge assistance. Do not automatically solve CAPTCHAs from a generic task approval.

Browserbase CLI 0.11.3 is installed separately from the operating system's `/usr/bin/browse` (xdg-open). Its read-only projects command verified the supplied account key. No paid Browserbase or Browser Use run was performed during setup. A Browser Use key has not been provided or live-verified.

MultiOn's TypeScript and Python SDK documentation remains reference-only until a current official API, supported SDK and working account are verified. Do not deploy old forked code as proof of current compatibility.

Sources: https://docs.browser-use.com/llms.txt, https://docs.browser-use.com/cloud/quickstart.md, https://docs.browser-use.com/cloud/api-v4/runs/create-run.md, https://browserbase.com/SKILL.md, https://github.com/browser-act/skills/tree/main/browser-act.

## Switching providers

Use the provider tabs at the top of Cloud Browser. Selection is stored in the page URL (`provider=tinyfish`, `browser_use`, `browserbase`, `external`, `browseract`, or `multion`) and browser Back/Forward restores it. Switching never submits or retries a task. Panels remain mounted so switching away does not lose an active session. Stop unused sessions explicitly; their provider time continues while they run.

Browser Use and Browserbase keep distinct account-and-provider-scoped tab references. An existing reference from the earlier combined panel migrates only to its matching provider and is removed from the old location, so clearing it does not restore an old completed run on reload. Profiles and sign-ins stay with their original provider; no cookie or credential transfer is performed.

Connection status is presence metadata, not a live provider health test. Native SDK controls require the native key binding or an owner-scoped deployment key. Broker accounts are labelled separately and are not substituted as SDK credentials. BrowserAct and MultiOn remain setup/verification options until their actual execution route is verified. Connected tools exposes the existing MCP workspace; its own discovery and permission checks still apply. No duplicated connector is created by switching.

## Automatic reuse of saved API keys

Opening Cloud Browser or refreshing its connection status sends an authenticated POST that prepares Browser Use and Browserbase connections. Existing connected native credentials take priority. Otherwise, the server checks only the signed-in owner's API-key metadata for an exact supported HTTPS website origin or an explicit `provider:browser_use` / `provider:browserbase` tag. Names alone never select a credential. Conflicting provider tags and multiple matches require manual setup in Connections.

A single match is resolved inside the server and validated with the provider's fixed read-only account endpoint. Only successful validation creates a native connection referencing the existing Vault item; the secret is neither copied nor returned. A stable provider/account key prevents duplicate bindings on repeated or concurrent preparation. The saved binding is read back before success is returned. Deleted secrets, unavailable providers and failed validation remain setup failures. Existing connections are saved metadata, not continuous live verification.

Preparation does not start a browser or approve spending. Starting a metered session still requires the existing cost acknowledgement. Website passwords and TOTP are excluded from this flow; use the supported secure browser sign-in handoff. Cookie/profile persistence remains provider-specific.

## Cloud workspace and Sandbox

The Cloud sidebar links directly to Sandbox, Phone, Browser, Terminal and Computer. The former overview URL (`/cloud`) redirects to Sandbox (`/cloud-sandbox`). Sandbox (`/cloud-sandbox`) uses the same owner/project-authorized provider tool discovery and execution as the other Cloud workspaces. It does not provision infrastructure by opening the page. Only tools returned by the selected provider can be invoked; generic MCP connection availability is not evidence that the provider implements sandbox isolation, a phone or a desktop. Provider charges and session lifetime remain provider-specific.

The browser switcher now lists the implemented capabilities and setup limits for each native adapter. Native opaque-reference browser setup through MCP validates the owned key with a fixed read-only provider request before creating or updating a binding, and marks the Vault item as reused so disconnect/replacement preserves it. Broker accounts remain separate from native SDK keys.


The Sandbox page also includes an administrator-only E2B manager using the existing deployment key. Status checks health and lists up to 100 environments. Creation requires a cost acknowledgement, uses the base template and a five-minute timeout, and never retries an ambiguous create. Stop requires explicit confirmation and is reported as a request, not proof of termination. UI responses include only sandbox identity, template, state and timestamps; tokens, environment variables and arbitrary metadata are excluded. The deployment account health/list were verified without creating a paid environment.

## Consolidated browser selection

Playwright MCP, Stagehand and Chrome DevTools now have dedicated browser tabs. Each uses the existing owner/project-authorized connection picker and filters discovered tool names to its browser family. An empty matching catalog is shown as unavailable; adding a tab does not install a cloud worker or transfer credentials. The old duplicated Provider setup guides component was removed. Embedded browser tools no longer repeat the Cloud Browser page title.

TinyFish Agent and Browser controls remain in the main TinyFish panel. Its additional API tools (Search, Fetch, Research and Monitor) are available through discovery of the same saved TinyFish connection, pinned to the official hosted MCP endpoint. Only tools the endpoint actually returns are selectable. Free allowances do not imply unlimited free usage, and opening or discovering tools does not execute a paid request.

Chrome DevTools can be registered in a Codex environment with `codex mcp add chrome-devtools -- npx -y chrome-devtools-mcp@latest --no-usage-statistics --no-performance-crux`. This is a local stdio registration, not an authenticated HTTP worker for the deployed Cloud Browser. A compatible Chrome runtime and secure worker bridge are separate requirements.

## Pointer, keyboard and verification controls

TinyFish Direct control now provides a visible local pointer marker, coalesced remote hover, pointer capture for drag, left/right/middle press/release, double-click counts and remote keyboard controls. Pointer commands are ordered; queued input is rejected after a tab change and a held button is released before detaching. Paste is available from keyboard events, the masked text field or an explicit clipboard button. Clipboard content is read only on that button click, is limited to 50,000 characters, and is not persisted. A tab/session change during clipboard permission handling cancels the insertion. This cursor represents the user's pointer, not an inferred AI-agent cursor.

Browserbase session creation accepts an optional `solveCaptchas` flag. It defaults to false, requires the existing metered-run acknowledgement, and is rejected for Browser Use. When explicitly requested, the flag is passed to Browserbase's native solver without enabling proxies or Verified. Provider plan eligibility and supported challenge types still apply. No live paid solve was performed during setup.

Verification assistance discovers CAPTCHA-related tools from an owned or project-authorized MCP worker. It never installs an extension, starts a solve, transfers cookies or attaches a solver to another provider's session automatically. Unresolved verification must be completed in the same session's supported interactive view. A separate Direct browser cannot resume a running agent session.

### Supplied repository assessment (2026-10-26)

| Source | Observed scope | Integration decision |
| --- | --- | --- |
| https://github.com/Dhravya/agent-captcha | Agent-only cryptographic guestbook challenge, rather than a general CAPTCHA-solving service | Not installed; it does not provide the requested cross-provider solver. |
| https://github.com/Captcha-Sonic/CaptchaSonic-Extension | Extension release distribution. README claims MIT; the `Licence` file is a proprietary agreement restricting modification and distribution. Full advertised source/build tree is absent from the repository root. | Not bundled or injected. A compatible extension-capable browser, reviewed package/license and provider account are prerequisites. |
| https://github.com/2captcha/mcp-captcha-solver | Corrected URL (the supplied trailing `l` returned 404). Local Python 3.11+/Selenium/Chrome demo with a reCAPTCHA v2 tool and `APIKEY_2CAPTCHA` requirement. | A separate authenticated worker and funded solver account are needed. It is not a drop-in attachment for every existing cloud browser. No matching solver credential was found in the metadata inventory during setup. |

Browserbase sources: https://docs.browserbase.com/platform/identity/captcha-solving and https://docs.browserbase.com/account/billing/plans. A request to solve a challenge is not proof that a challenge was solved; verify the destination page before resuming the task.
