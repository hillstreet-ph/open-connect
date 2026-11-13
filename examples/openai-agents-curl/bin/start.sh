#!/usr/bin/env bash

set -Eeuo pipefail
BIN_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

"$BIN_DIR/create-agent.sh"
"$BIN_DIR/run-session.sh" "$@"
