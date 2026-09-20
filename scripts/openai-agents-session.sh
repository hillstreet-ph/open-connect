#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

API_BASE="${OPENAI_API_BASE:-https://api.openai.com/v1}"
PROJECT_ID="${OPENAI_PROJECT_ID:-proj_P1GhW0FJdBA5g3dpuKN8BZh8}"
STATE_DIR="${OPENAI_AGENT_STATE_DIR:-.openai}"
AGENT_DEFINITION="${OPENAI_AGENT_DEFINITION:-config/openai-agent.definition.json}"
MESSAGE="${1:-Review this Open-Connect project and propose the three highest-impact next engineering tasks.}"

fail() { printf 'error: %s\n' "$*" >&2; exit 1; }
command -v curl >/dev/null || fail "curl is required"
command -v jq >/dev/null || fail "jq is required"
[[ -n "${OPENAI_API_KEY:-}" ]] || fail "set OPENAI_API_KEY before running"
[[ -r "$AGENT_DEFINITION" ]] || fail "agent definition is not readable: $AGENT_DEFINITION"
jq -e '.name and .model and (.reasoning.effort) and (.text.format.type)' "$AGENT_DEFINITION" >/dev/null || fail "agent definition is invalid"
mkdir -p "$STATE_DIR"

headers=(-H "Authorization: Bearer $OPENAI_API_KEY" -H "OpenAI-Project: $PROJECT_ID" -H "OpenAI-Beta: agents=v1" -H "Content-Type: application/json")

if [[ -s "$STATE_DIR/agent-id" && "${OPENAI_AGENT_RECREATE:-0}" != "1" ]]; then
  agent_id="$(<"$STATE_DIR/agent-id")"
  [[ "$agent_id" =~ ^agent_ ]] || fail "saved agent ID is invalid; set OPENAI_AGENT_RECREATE=1"
  printf 'Using reusable agent: %s\n' "$agent_id" >&2
else
  agent_response="$(curl --fail-with-body --silent --show-error -X POST "$API_BASE/agents" "${headers[@]}" --data-binary "@$AGENT_DEFINITION")" || fail "could not create agent"
  agent_id="$(jq -er '.id' <<<"$agent_response")" || fail "agent response did not contain an id"
  printf '%s\n' "$agent_id" > "$STATE_DIR/agent-id"
  printf 'Created reusable agent: %s\n' "$agent_id" >&2
fi

session_payload="$(jq -n --arg agent_id "$agent_id" --arg input "$MESSAGE" '{agent_id:$agent_id,environment:{type:"openai_hosted"},input:$input,stream:true}')"

# The stream includes output deltas, lifecycle events, tool calls, and tool results.
# The hosted executor resolves built-in calls. We persist IDs and fail on root lifecycle errors.
handle_events() {
  local line payload event_type session_id completed=0
  while IFS= read -r line; do
    [[ "$line" == data:\ * ]] || continue
    payload="${line#data: }"
    [[ "$payload" == "[DONE]" ]] && continue
    jq -c . <<<"$payload" || fail "received a malformed stream event"
    event_type="$(jq -r '.type // empty' <<<"$payload")"
    session_id="$(jq -r '.session.id // .session_id // empty' <<<"$payload")"
    [[ -z "$session_id" ]] || printf '%s\n' "$session_id" > "$STATE_DIR/session-id"
    case "$event_type" in
      agent.session.turn.completed)
        completed=1
        ;;
      error|agent.session.failed|agent.session.environment.failed|agent.session.turn.failed|agent.session.turn.cancelled)
        printf 'agent lifecycle error: %s\n' "$event_type" >&2
        return 1
        ;;
      *tool_call*|*function_call*)
        printf 'tool event: %s\n' "$event_type" >&2
        ;;
    esac
    if jq -e '(.required_actions // []) | length > 0' <<<"$payload" >/dev/null; then
      printf 'agent requires an external tool result; inspect the emitted required_actions event\n' >&2
      return 2
    fi
  done
  [[ "$completed" == "1" ]] || fail "stream closed before a completed turn was observed"
}

curl --fail-with-body --no-buffer --silent --show-error -X POST "$API_BASE/agents/sessions" \
  "${headers[@]}" -H "Accept: text/event-stream" -d "$session_payload" | handle_events

printf '\nSession stream closed. Agent ID saved to %s/agent-id\n' "$STATE_DIR" >&2
