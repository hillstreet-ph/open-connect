# Browser, cloud computer & terminal autonomy — Open-Connect

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
