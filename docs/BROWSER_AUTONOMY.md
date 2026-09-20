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

| Package | Type | Role |
|---------|------|------|
| **multion-autonomous** | skill | MultiOn natural-language cloud/local browser |
| **cloudflare-browser** | skill | Cloudflare Browser Rendering (CDP WebSocket) |
| **agent-browser** | skill | CLI snapshot / click / fill for agents |

Downloads (after Pages deploy):

- `/downloads/skills/multion-autonomous/`
- `/downloads/skills/cloudflare-browser/`
- `/downloads/skills/agent-browser/`

## MultiOn (https://docs.multion.ai/welcome)

- API: `POST https://api.multion.ai/v1/web/browse`
- Header: `X_MULTION_API_KEY`
- Modes: remote cloud session · local Chrome extension
- SDK: `npm install multion`

## Grok + Open-Connect

```text
Grok / xAI client
  → https://open-connect.site/v1  (models)
  → https://open-connect.site/mcp (tools)
  → Secrets: multion_api_key, CDP_SECRET
  → Skills: multion-autonomous | cloudflare-browser | agent-browser
```

## Capability matrix

| Need | Use |
|------|-----|
| Natural language browse at scale | MultiOn remote |
| User's logged-in Chrome | MultiOn local + extension |
| Headless in Cloudflare Workers | cloudflare-browser CDP |
| Deterministic CLI automation | agent-browser |
| LLM reasoning (Grok) | Open-Connect /v1 |

## Secrets to store

- `multion_api_key`
- `CDP_SECRET` (Cloudflare Browser Rendering worker)
