# building-ai-agent-on-cloudflare

Source: Cloudflare Skills repository (`cloudflare/skills`).

Install in a compatible agent workspace:

```bash
npx skills add https://github.com/cloudflare/skills --skill building-ai-agent-on-cloudflare
```

Open-Connect registration: `config/fullstack-agent-toolkit.registry.json`.

## Intended capabilities

Use this skill for Cloudflare-native AI agent architecture and implementation involving Workers, Workers AI, Agents SDK, Durable Objects, Workflows, Queues, R2, D1, Vectorize, AI Gateway, and Browser Rendering when supported by the connected Cloudflare account.

## Security policy

Do not commit API tokens or account secrets. Resolve credentials through Open-Connect/Open-Secret credential references. Production deployment, DNS/WAF mutations, credential changes, and destructive operations remain gated.

## Verification

Before declaring a Cloudflare change complete, verify the deployed Worker/application endpoint and inspect runtime/observability evidence. Browser-facing changes should receive an automated browser smoke test where applicable.
