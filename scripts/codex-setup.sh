#!/usr/bin/env bash
# Development-only bootstrap. Never migrate, deploy, or write credentials.
set -Eeuo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
MODE="${1:-install}"
case "$MODE" in install|check) ;; *) echo 'Usage: bash scripts/codex-setup.sh [install|check]' >&2; exit 2;; esac
command -v node >/dev/null || { echo 'Node >=22.12 is required' >&2; exit 1; }
node -e 'const [a,b]=process.versions.node.split(".").map(Number); if(a<22||(a===22&&b<12))process.exit(1)'
TOOLS="${XDG_CACHE_HOME:-$HOME/.cache}/hillstreet-codex/bun-1.4.2"
if command -v bun >/dev/null; then BUN="$(command -v bun)"; else BUN="$TOOLS/node_modules/.bin/bun"; fi
if [[ "$MODE" == install ]]; then
  if [[ ! -x "$BUN" ]]; then npm install --prefix "$TOOLS" --no-save --package-lock=false bun@1.4.2; fi
  "$BUN" install --frozen-lockfile
  echo 'Development dependencies installed; provider access is not implied.'
else
  [[ -x "$BUN" ]] || { echo 'Run install mode first' >&2; exit 1; }
  export PATH="$(dirname "$BUN"):$PATH"
  "$BUN" run lint
  "$BUN" run test
  python3 scripts/update-marketplace-branch.test.py
  # Build-only public placeholders, matching CI. No production credentials needed.
  export VITE_SUPABASE_URL="https://huadtiuuoiriqrjpjxhr.supabase.co"
  export VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_placeholder"
  export VITE_APP_URL="http://localhost:3000"
  "$BUN" run build
  "$BUN" run test:ssr
fi
