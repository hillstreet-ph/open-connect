# Open-Connect Playwright worker

Cloud Browser uses one execution engine: Microsoft Playwright MCP. The deployment candidate pins `@playwright/mcp` 0.0.83 and installs its Chromium build. The local client equivalent is `npx @playwright/mcp@latest`; production upgrades go through container smoke tests rather than updating every task.

The authenticated Open-Connect app and MCP gateway call this worker. Each authenticated owner receives a separate MCP process, temporary working directory and separate browser context. Actions are serialized per owner. Eight sessions are allowed, with idle cleanup after 15 minutes. No other provider is selected when Playwright fails.

## Deployment

Build this directory's Dockerfile. Set a cryptographically generated `PLAYWRIGHT_WORKER_TOKEN` of at least 32 characters through the deployment secret store. Configure the same token and `PLAYWRIGHT_WORKER_URL=https://<worker-host>` on every active Open-Connect app/gateway runtime, including Cloudflare bindings where applicable. Never put the token in client variables, source control or the catalog.

Expose only the authenticated worker port 8080 over HTTPS. `/health` reports process readiness, not verified Chromium execution. Run `smoke.mjs` with the worker token and `PLAYWRIGHT_SMOKE_ORIGIN` to verify actual catalog discovery, navigation, snapshots, screenshots, separate owners and cookie isolation. CI also restarts the container and verifies retained sign-ins when persistent profiles are enabled. The GitHub Playwright worker workflow builds and runs this check against an isolated candidate container.

Use one worker replica until owner-affine routing is implemented. Configure deployment memory/CPU limits and outbound network restrictions appropriate to the environment; block cloud metadata and internal services. This worker is a browser executor and must not receive unrelated deployment secrets. Chromium runs non-root inside the container with its sandbox disabled for container compatibility; container isolation remains required.

## Gateway and user interface

`cloud_browser_tools` returns supported tool schemas. `cloud_browser_call` executes one discovered action; it requires a personal administrator key with invocation scopes. The authenticated app uses the same owner session through server functions. Browser task prompts use the owner's existing free-model gateway with an eight-action limit. Model reports are labeled as reports, not independent success receipts. Failures are not retried automatically.

Saved legacy TinyFish profiles and credentials are not converted or deleted. Sessions are ephemeral by default. Set `PLAYWRIGHT_PROFILE_ROOT=/data/profiles` and mount a persistent, access-controlled volume at `/data` to retain each owner’s profile. Profile directories use hashed owner names and permissions 0700. A profile is never shared between owners. Legacy cookies are not automatically imported. Set `PLAYWRIGHT_LIVE_VIEW=1` to enable private manual sign-in using the same Playwright Chromium session, Xvfb and the bundled noVNC viewer. View grants expire after ten minutes, stay outside URLs, and are revoked when sign-in ends or the session closes. Agent calls are blocked while a view grant is active. Run `node live-smoke.mjs` inside the candidate container to verify real keyboard input and control handoff.

`cloud_browser_cancel_task` and the app Stop task button invalidate the active task identity and close its owner browser. A canceled task cannot reopen the browser. Closing first calls `browser_close` to release Chromium profile locks before stopping the desktop. Background scheduling is not provided by this worker; recurring work needs a separately configured scheduler.

Arbitrary server code, page evaluation, arbitrary file upload and runtime browser installation tools are excluded. Close with `browser_close` after a task. External provider integrations outside Cloud Browser remain independent connections.

Source: https://github.com/microsoft/playwright-mcp
