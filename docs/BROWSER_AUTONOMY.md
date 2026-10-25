# Browser, cloud computer & terminal autonomy — Open-Connect

## Session API

The control plane exposes tenant-scoped browser sessions without exposing credentials to agents:

1. `POST /api/v1/sessions` creates a `browser` or `computer` session through an isolated worker broker.
2. `POST /api/v1/sessions/{id}/actions` accepts navigation, snapshot, click, fill, select, key, scroll, screenshot, profile, and login-handoff actions.
3. `DELETE /api/v1/sessions/{id}` closes the provider session.

Authentication state is addressed by an opaque `profile://...` reference. Login values are addressed by `vault://...` references and resolved only by the isolated worker. Raw credentials are never returned to the agent or stored in browser action logs.

Profile load/save, credential-backed fills, and login handoff are protected actions and require a single-action approval. MFA, CAPTCHA, passkeys, account recovery, payment, permission changes, and destructive actions always require a human handoff; the automation must not bypass provider safeguards.

The `agent-browser` adapter is broker-only. The API service never launches a shared local browser process. Configure `OC_BROWSER_WORKER_URL` and the corresponding vault reference in the deployment secret store. Development, staging, and production profiles must remain separate.

Professional stack for autonomous browsing and compute control.

## Packages (marketplace / downloads)

| Package                | Type  | Role                                         |
| ---------------------- | ----- | -------------------------------------------- |
| **multion-autonomous** | skill | MultiOn natural-language cloud/local browser |
| **cloudflare-browser** | skill | Cloudflare Browser Rendering (CDP WebSocket) |
| **agent-browser**      | skill | CLI snapshot / click / fill for agents       |

Downloads (after Pages deploy):

- `/downloads/skills/multion-autonomous/`
- `/downloads/skills/cloudflare-browser/`
- `/downloads/skills/agent-browser/`

## MultiOn reference

The official [sessions guide](https://docs.multion.ai/learn/sessions) documents goal-based
browsing and isolated sessions that can be continued through explicit steps. The step response can
request user input (`ASK_USER`), continue (`CONTINUE`), or finish (`DONE`). Local mode depends on
MultiOn's Chrome extension. These are provider capabilities, not proof that Open-Connect implements
that provider or that a saved login survives after a session closes.

The user-supplied [tmc/multion-api](https://github.com/tmc/multion-api) repository is a fork of
`edreisMD/multion_api`. Its README points to the MultiOn service and SDKs. Treat it as reference
material, not a complete self-hosted cloud browser engine. The supplied welcome page identifies
Agent V1 Beta; its AgentQ release wording is not evidence that Agent 2.0 is available.

The API-reference links reached from the sessions guide returned 404 during review on 2026-10-25.
Do not use the previously listed `/v1/web/browse` endpoint or auth header as a verified contract.
Before adding a MultiOn adapter, verify its current API schema, authentication, session lifetime,
account access and cancellation behavior against a working provider account.

## Grok + Open-Connect

```text
Grok / xAI client
  → https://open-connect.site/v1  (models)
  → https://open-connect.site/mcp (tools)
  → Secrets: multion_api_key, CDP_SECRET
  → Skills: multion-autonomous | cloudflare-browser | agent-browser
```

## Capability matrix

| Need                             | Use                       |
| -------------------------------- | ------------------------- |
| Natural language browse at scale | MultiOn remote            |
| User's logged-in Chrome          | MultiOn local + extension |
| Headless in Cloudflare Workers   | cloudflare-browser CDP    |
| Deterministic CLI automation     | agent-browser             |
| LLM reasoning (Grok)             | Open-Connect /v1          |

## Secrets to store

- `multion_api_key`
- `CDP_SECRET` (Cloudflare Browser Rendering worker)

## Native TinyFish cloud browser

`/cloud-browser` is the goal-based browser console: choose a saved profile (or a fresh browser),
enter a URL and task, set a duration, watch the live view, stop a task, and search recent runs.
Profile controls create or rename a profile, set its default status, and inspect saved domain counts.
The profile manager link opens TinyFish's hosted sign-in setup. Sign in there, explicitly save,
then return and refresh. Saved state can expire; a cookie count does not prove a valid sign-in.

Agents connected to `/mcp` can use `cloud_browser_save_profile` to create/update a profile and
`cloud_browser_profile_setup` with `start`, `save`, or `cancel` for the documented CDP setup lifecycle.
A setup session expires after 15 minutes. Its `cdp_url` is a private connection capability, not a
public viewer link; do not publish it, log it, or pass `base_url` to Playwright. Save only after
completing the authorized sign-in. Cancel unfinished sessions rather than leaving them running.
No cookie values or passwords are returned by the profile inspection UI.

Provider requirement: a personal TinyFish API key connected in Connections → TinyFish Cloud Browser, or an ACTIVE, owned TinyFish account managed through Composio for the agent API. The broker injects authentication server-side for tasks, profiles and wallet operations; browser sessions on the separate browser API still require a direct credential. Project, workspace and organization keys cannot use the personal broker fallback.
An imported connection marked connected does not prove it has a usable vault credential. A missing
credential must be reconnected securely; a workflow key cannot access personal profile state.

Reference: https://docs.tinyfish.ai/agent-api/browser-context-profiles

## Source review and compatibility (2026-10-25)

| Source                                                                              | Verified role                                                                                                | What it does not establish                                                                                                            |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| [MultiOn sessions guide](https://docs.multion.ai/learn/sessions)                    | Autonomous browse, create/step/close session, user-input handoff, screenshots and extension-based local mode | Current account access, working API-reference endpoints, persistent cookies after session closure, or an Open-Connect MultiOn adapter |
| [tmc/multion-api](https://github.com/tmc/multion-api)                               | Fork containing API/SDK integration examples                                                                 | A self-hostable MultiOn reasoning/browser service                                                                                     |
| [TinyFish organization](https://github.com/tinyfish-io)                             | Publisher of integration, cookbook and MCP repositories                                                      | One installable package that provides all TinyFish cloud infrastructure                                                               |
| [TinyFish MCP server](https://github.com/tinyfish-io/tinyfish-mcp-server)           | Local HTTP proxy to `https://agent.tinyfish.ai/mcp`; tools and execution come from the hosted service        | An offline or independently self-hosted TinyFish engine                                                                               |
| [TinyFish profile API](https://docs.tinyfish.ai/agent-api/browser-context-profiles) | Explicit profile creation, setup, save/cancel, then saved-state reuse                                        | Guaranteed valid logins forever or an interactive viewer in every CDP setup response                                                  |

Open-Connect currently implements the TinyFish REST adapter and native task/profile console in
PR #403. A selected profile restores saved state for a new task; it does not continue the previous
agent's reasoning or resume the same live tab. MultiOn-style `step`/`ASK_USER` continuation and
Agent-run in-page takeover are separate capabilities. The direct-control mode uses a separate
TinyFish CDP session with clicks, typing and tab selection; it does not take over an active Agent run. Connecting TinyFish MCP remains an alternative through the
advanced connection workspace when its credential and actual tool discovery are verified.

End-to-end acceptance requires a usable personal provider key, a saved sign-in setup, two successive
tasks proving login reuse, a live-view check, a stop/cleanup check, and private-profile isolation.
Mock tests or a connected database row do not satisfy live-provider acceptance. No upstream package
or Chrome extension was installed during this source review.
