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
