# Open portfolio E2E (pointer)

Canonical readiness, gaps, human gates, and autonomous driver:

**https://github.com/hillstreet-ph/open-kobeplay/blob/main/docs/OPEN_PORTFOLIO_E2E.md**

## This project (Open-Connect)

| Item | Status |
|------|--------|
| Purpose | AI control plane — Resource / Connection / Model hubs, MCP & OpenAI-compatible gateway |
| Domain | https://open-connect.site |
| Sentry | `open-connect` (Production DSN in secrets only) |
| Telegram topic | thread **3** in Open Notifications |
| Uptime | Sentry monitors on `/` and `/api/v1/health` |
| SDK | Issue #27 — wire `SENTRY_DSN` from env |
| Alerts | Templates A/B — see open-kobeplay docs |

## Checklist

- [ ] `SENTRY_DSN` in Cloudflare/Zeabur secrets
- [ ] SDK init with environment + release
- [ ] `.env.example` placeholder only
- [ ] Alert action → Telegram Worker after deploy
