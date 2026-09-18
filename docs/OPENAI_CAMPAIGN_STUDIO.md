# OpenAI Campaign Studio

Campaign Studio is a full-stack Open-Connect workspace at `/campaign-studio`. The browser sends validated brief fields to `/api/campaign-studio`; only the server reads `OPENAI_API_KEY` and calls the Responses API. The endpoint requests structured campaign copy and an image-generation tool call, then returns the validated campaign result and image data URL.

## Setup and run

```bash
cp .env.example .env.local
# Add OPENAI_API_KEY to .env.local
npm install
npm run dev
```

Use an API key with access to project `proj_P1GhW0FJdBA5g3dpuKN8BZh8`. Never place the key in a `VITE_` variable. For deployment, add the same server-only variables in the hosting provider secret manager.

## Agents API runner

The reusable agent runner calls the HTTP API directly with `curl`, creates **New agent**, starts an OpenAI-hosted session using the returned agent ID, and streams every server-sent event to stdout.

```bash
export OPENAI_API_KEY='...'
npm run agent:start -- "Audit the campaign studio and recommend the next release tasks."
```

Requirements: Bash, `curl`, and `jq`. The returned agent ID is saved locally under `.openai/agent-id`; `.openai/` must remain git-ignored. Built-in tool calls execute in the OpenAI-hosted environment and their events are emitted in the stream. HTTP and lifecycle failures remain visible in the terminal.

## Configuration

- `OPENAI_CAMPAIGN_MODEL` changes the Responses text/reasoning model.
- `OPENAI_IMAGE_MODEL` changes the image generation model.
- The creative-director instructions and campaign prompt live in `src/routes/api/campaign-studio.ts`.
- Input and output schemas live in `src/lib/campaign-studio.ts`.

## Validation plan

1. Run lint, unit tests, and a production build.
2. With a funded project API key, generate a brief using at least one and then six channels.
3. Confirm copy has exactly three variants, every checklist renders, and an image or explicit visual fallback appears.
4. Remove `OPENAI_API_KEY` and confirm the UI shows a safe configuration error without exposing server details.
5. Check mobile layout, keyboard focus, reduced-motion behavior, and regeneration.

References: [Agents API overview](https://developers.openai.com/api/docs/guides/agents-api/overview), [Agents sessions](https://developers.openai.com/api/docs/guides/agents-api/sessions), [Responses text generation](https://developers.openai.com/api/docs/guides/text), [image generation](https://developers.openai.com/api/docs/guides/image-generation), and the [model catalog](https://developers.openai.com/api/docs/models).
