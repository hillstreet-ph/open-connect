#!/usr/bin/env bash

set -Eeuo pipefail

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
API_BASE="${OPENAI_API_BASE:-https://api.openai.com/v1}"
PROJECT_ID="${OPENAI_PROJECT_ID:-proj_P1GhW0FJdBA5g3dpuKN8BZh8}"
AGENT_CONFIG="${AGENT_CONFIG:-$APP_DIR/config/agent.json}"
STATE_DIR="${STATE_DIR:-$APP_DIR/.state}"

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

require_runtime() {
  command -v curl >/dev/null 2>&1 || die "curl is required"
  command -v jq >/dev/null 2>&1 || die "jq is required"
  [[ -n "${OPENAI_API_KEY:-}" ]] || die "OPENAI_API_KEY is not set"
  [[ -r "$AGENT_CONFIG" ]] || die "agent config is not readable: $AGENT_CONFIG"
  jq -e . "$AGENT_CONFIG" >/dev/null || die "agent config is not valid JSON"
  mkdir -p "$STATE_DIR"
  chmod 700 "$STATE_DIR"
}

api_headers() {
  printf '%s\n' \
    '-H' 'OpenAI-Beta: agents=v1' \
    '-H' "Authorization: Bearer $OPENAI_API_KEY" \
    '-H' "OpenAI-Project: $PROJECT_ID" \
    '-H' 'Content-Type: application/json'
}

api_curl() {
  local -a headers
  mapfile -t headers < <(api_headers)
  curl --fail-with-body --silent --show-error "${headers[@]}" "$@"
}

read_agent_id() {
  local file="$STATE_DIR/agent_id"
  [[ -s "$file" ]] || die "no saved agent ID; run ./bin/create-agent.sh first"
  tr -d '\r\n' < "$file"
}

write_private_file() {
  local path="$1"
  local value="$2"
  umask 077
  printf '%s\n' "$value" > "$path"
}
