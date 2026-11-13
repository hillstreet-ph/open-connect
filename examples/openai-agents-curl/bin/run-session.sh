#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"
require_runtime

agent_id="$(read_agent_id)"
initial_message="${*:-Use get_runtime_info, then introduce yourself and summarize the runtime in one short paragraph.}"
events_file="$STATE_DIR/events.jsonl"
: > "$events_file"
chmod 600 "$events_file"

session_payload="$(jq -n \
  --arg agent_id "$agent_id" \
  --arg input "$initial_message" \
  '{
    agent_id: $agent_id,
    environment: {type: "openai_hosted"},
    input: $input,
    stream: true
  }')"

session_id=''
root_turn_finished='false'

submit_tool_results() {
  local event_json="$1"
  local current_session_id="$2"
  local results='[]'
  local action name turn_id call_id output result

  while IFS= read -r action; do
    name="$(jq -r '.name // empty' <<<"$action")"
    turn_id="$(jq -r '.turn_id // empty' <<<"$action")"
    call_id="$(jq -r '.call_id // empty' <<<"$action")"
    [[ -n "$turn_id" && -n "$call_id" ]] || continue

    case "$name" in
      get_runtime_info)
        output="$(jq -cn \
          --arg utc_time "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
          --arg os "$(uname -srm)" \
          --arg shell "${BASH_VERSION:+bash $BASH_VERSION}" \
          '{utc_time: $utc_time, os: $os, shell: $shell}')"
        result="$(jq -cn \
          --arg turn_id "$turn_id" \
          --arg call_id "$call_id" \
          --arg output "$output" \
          '{type:"agent.session.input.tool_result", turn_id:$turn_id, call_id:$call_id, success:true, output:$output}')"
        ;;
      *)
        result="$(jq -cn \
          --arg turn_id "$turn_id" \
          --arg call_id "$call_id" \
          --arg error "Unsupported local tool: $name" \
          '{type:"agent.session.input.tool_result", turn_id:$turn_id, call_id:$call_id, success:false, error:$error}')"
        ;;
    esac
    results="$(jq -cn --argjson all "$results" --argjson item "$result" '$all + [$item]')"
  done < <(jq -c '.session.required_actions[]? | select(.type == "function_call")' <<<"$event_json")

  [[ "$(jq 'length' <<<"$results")" -gt 0 ]] || return 0
  api_curl \
    -X POST "$API_BASE/agents/sessions/$current_session_id/events" \
    --data-binary "$(jq -cn --argjson events "$results" '{events:$events}')" \
    >/dev/null
}

printf 'Creating a session with agent %s...\n' "$agent_id" >&2

while IFS= read -r line; do
  [[ "$line" == data:* ]] || continue
  data="${line#data:}"
  data="${data# }"
  [[ -n "$data" && "$data" != '[DONE]' ]] || continue

  if ! jq -e . >/dev/null 2>&1 <<<"$data"; then
    printf 'warning: ignored malformed SSE data: %s\n' "$data" >&2
    continue
  fi

  printf '%s\n' "$data" >> "$events_file"
  event_type="$(jq -r '.type // "unknown"' <<<"$data")"
  printf '[event] %s\n' "$event_type" >&2

  if [[ -z "$session_id" ]]; then
    session_id="$(jq -r '.session.id // .session_id // empty' <<<"$data")"
    if [[ -n "$session_id" ]]; then
      write_private_file "$STATE_DIR/session_id" "$session_id"
      printf 'Session ID: %s\n' "$session_id" >&2
    fi
  fi

  case "$event_type" in
    agent.session.turn.output_text.delta)
      jq -jr '.delta // .text // empty' <<<"$data"
      ;;
    agent.session.requires_action)
      [[ -n "$session_id" ]] || die "tool action arrived before a session ID"
      submit_tool_results "$data" "$session_id"
      ;;
    error)
      die "$(jq -r '.error.message // .message // "Agents API stream error"' <<<"$data")"
      ;;
    agent.session.failed|agent.session.environment.failed)
      die "agent lifecycle failure: $event_type"
      ;;
    agent.session.turn.failed)
      if [[ "$(jq -r '.turn.subagent_id // empty' <<<"$data")" == '' ]]; then
        die "$(jq -r '.turn.error.message // "root agent turn failed"' <<<"$data")"
      fi
      ;;
    agent.session.turn.cancelled)
      if [[ "$(jq -r '.turn.subagent_id // empty' <<<"$data")" == '' ]]; then
        die "root agent turn was cancelled"
      fi
      ;;
    agent.session.turn.completed)
      if [[ "$(jq -r '.turn.subagent_id // empty' <<<"$data")" == '' ]]; then
        root_turn_finished='true'
      fi
      ;;
  esac
done < <(
  api_curl --no-buffer \
    -X POST "$API_BASE/agents/sessions" \
    --data-binary "$session_payload"
)

printf '\n' >&2
[[ "$root_turn_finished" == 'true' ]] || die "stream closed before the root turn completed; inspect $events_file"
printf 'Completed. Raw events: %s\n' "$events_file" >&2
