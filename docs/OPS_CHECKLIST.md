# Open-Connect ops checklist

- [ ] Sentry project `open-connect` + Production DSN as `SENTRY_DSN`
- [ ] SDK init (env DSN, environment, release, tracesSampleRate)
- [ ] `.env.example` has `SENTRY_DSN=` empty
- [ ] Telegram topic thread id **3**
- [ ] CI green on main
- [ ] Health: `/api/v1/health`
- [ ] No secrets in git
