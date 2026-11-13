#!/usr/bin/env bash

source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/common.sh"
require_runtime

if [[ -s "$STATE_DIR/agent_id" && "${FORCE_CREATE:-0}" != '1' ]]; then
  printf 'Reusing saved agent ID: %s\n' "$(read_agent_id)"
  printf 'Set FORCE_CREATE=1 to create a new reusable agent.\n' >&2
  exit 0
fi

response="$(api_curl \
  -X POST "$API_BASE/agents" \
  --data-binary "@$AGENT_CONFIG")"

agent_id="$(jq -er '.id | select(type == "string" and length > 0)' <<<"$response")" || {
  jq . <<<"$response" >&2 || true
  die "create-agent response did not include an agent ID"
}

write_private_file "$STATE_DIR/agent_id" "$agent_id"
jq '{id, name, model, object, created_at}' <<<"$response"
printf 'Saved reusable agent ID to %s\n' "$STATE_DIR/agent_id" >&2
