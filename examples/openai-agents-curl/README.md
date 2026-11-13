# OpenAI Agents API — cURL session runner

A shell-first example that calls the Agents HTTP API directly with `curl`. It:

- creates the reusable **New agent** definition and saves its returned ID;
- starts an OpenAI-hosted session using that `agent_id`;
- sends an initial user message and streams Server-Sent Events (SSE);
- prints text deltas and records raw JSON events;
- handles lifecycle failures and cancelled or failed root turns; and
- fulfills the safe local `get_runtime_info` function when the API emits `agent.session.requires_action`.

The OpenAI-hosted environment supplies the managed Linux executor. The API key remains in the client process and is not passed into that sandbox.

## Prerequisites

- Bash 4+
- `curl`
- `jq`
- An application API key in OpenAI project `proj_P1GhW0FJdBA5g3dpuKN8BZh8`
- Key permissions: `api.agents.read`, `api.agents.write`, and `api.responses.write`

## Configure

Export the key in your terminal. Do not put a live key in `.env.example` or commit it.

```bash
export OPENAI_API_KEY="your-project-api-key"
export OPENAI_PROJECT_ID="proj_P1GhW0FJdBA5g3dpuKN8BZh8"
```

## Run

From this directory:

```bash
./bin/start.sh
```

Or provide the initial message:

```bash
./bin/start.sh "Use get_runtime_info and tell me the current UTC time."
```

To reuse the already-created agent instead of creating another:

```bash
./bin/run-session.sh "Introduce yourself in one sentence."
```

`start.sh` also reuses `.state/agent_id` by default. To intentionally create a replacement definition, run:

```bash
FORCE_CREATE=1 ./bin/start.sh
```

Local IDs and event logs are written with private permissions under `.state/`, which is ignored by Git.

## API behavior

All requests include:

```text
OpenAI-Beta: agents=v1
Authorization: Bearer $OPENAI_API_KEY
OpenAI-Project: proj_P1GhW0FJdBA5g3dpuKN8BZh8
```

The scripts use `POST /v1/agents` for the reusable definition, then `POST /v1/agents/sessions` with `agent_id`, `environment.type: openai_hosted`, the initial input, and `stream: true`. Tool results are returned to `POST /v1/agents/sessions/{session_id}/events`.

## Files

```text
config/agent.json       Reusable agent definition
bin/create-agent.sh     Create and persist the returned agent ID
bin/run-session.sh      Start and stream a session; handle tools/errors
bin/start.sh            Run both steps
```

## Troubleshooting

- `401`: confirm `OPENAI_API_KEY` is an application key for the specified project.
- `403`: grant the three required API permissions and confirm project access.
- `404` or model-access error: confirm the project can use `gpt-6-astra` and the Agents API.
- Stream disconnect: inspect `.state/events.jsonl`; session streams do not replay missed events, so retrieve the saved session/items before retrying production work.

Official documentation:

- https://developers.openai.com/api/docs/guides/agents-api/overview
- https://developers.openai.com/api/docs/guides/agents-api/quickstart
- https://developers.openai.com/api/docs/guides/agents-api/configuration
- https://developers.openai.com/api/docs/guides/agents-api/sessions/events
- https://developers.openai.com/api/docs/guides/agents-api/tools/functions
