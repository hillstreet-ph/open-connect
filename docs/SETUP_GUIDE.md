# Open Connect Setup & Integration Guide

## Rapid Setup
1. **Fork Repository**: OrgHide/open-connect.
2. **Supabase Init**: Link project `rxpkxtzzkvwgjtbtcctc`.
3. **Railway Deploy**: Connect GitHub repo to Railway dashboard.

## Environment Configuration
- **Ollama**: Pre-configured for local/remote LLM inference.
- **OpenRouter**: Primary gateway for frontier models.
- **Langfuse**: Tracing active at `https://us.cloud.langfuse.com`.

## API Aliases
- **Hugging Face**: Use token aliases for transformer inference.
- **Gemini**: Supported via Google Vertex AI or standard API keys.

## Deployment Target
- **Live URL**: https://open-connect-production.up.railway.app
- **Healthcheck**: `/ready`
