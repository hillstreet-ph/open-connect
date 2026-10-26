#!/bin/sh
set -eu
if [ -n "${PLAYWRIGHT_PROFILE_ROOT:-}" ]; then
  mkdir -p "$PLAYWRIGHT_PROFILE_ROOT"
  chown browser:browser "$PLAYWRIGHT_PROFILE_ROOT"
  chmod 700 "$PLAYWRIGHT_PROFILE_ROOT"
fi
exec gosu browser "$@"
