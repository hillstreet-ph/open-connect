# Model Gateway — OpenRouter + LiteLLM

**Endpoint:** `https://open-connect.site/v1`  
**Auth:** `Authorization: Bearer oc_live_…` with scopes `models:read` / `models:invoke`

## Architecture

```text
Client → /v1/models | /v1/chat/completions
       → authenticate oc_live_ key
       → resolveModelId (aliases)
       → OpenRouter (primary when key present)
       → optional LiteLLM proxy (if LITELLM_BASE_URL is not openrouter.ai)
```

Production Pages currently sets `LITELLM_BASE_URL` + `LITELLM_MASTER_KEY` pointing at OpenRouter (health: `model_upstream: openrouter`). That is valid — one upstream, full multi-provider catalog via OpenRouter.

Optional dual setup:

| Env | Purpose |
|-----|---------|
| `OPENROUTER_API_KEY` | Preferred OpenRouter key |
| `OPENROUTER_BASE_URL` | Default `https://openrouter.ai/api/v1` |
| `LITELLM_MASTER_KEY` | LiteLLM proxy key **or** legacy OpenRouter key |
| `LITELLM_BASE_URL` | Self-hosted LiteLLM base, **or** `https://openrouter.ai/api/v1` |

Never commit these values.

## Catalog

`GET /v1/models` merges:

1. Managed aliases (openai, claude, gemini, grok, …)
2. Full OpenRouter `/models` list when upstream responds
3. LiteLLM `/models` when a separate LiteLLM base is configured

## Client example

```bash
export OPENAI_API_BASE=https://open-connect.site/v1
export OPENAI_API_KEY=oc_live_YOUR_KEY

curl -sS "$OPENAI_API_BASE/models" -H "Authorization: Bearer $OPENAI_API_KEY" | head

curl -sS "$OPENAI_API_BASE/chat/completions" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"open-connect/claude","messages":[{"role":"user","content":"hi"}]}'
```

Aliases include `open-connect/fast`, `open-connect/coding`, `open-connect/claude`, `gpt-4o`, `claude-sonnet`, `gemini-flash`, …
