#!/usr/bin/env bash
# Development-only bootstrap. Never migrate, deploy, or write credentials.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
MODE="${1:-install}"
case "$MODE" in install|check) ;; *) echo 'Usage: bash scripts/codex-setup.sh [install|check]' >&2; exit 2;; esac
command -v node >/dev/null || { echo 'Node >=22.12 is required' >&2; exit 1; }
node -e 'const [a,b]=process.versions.node.split(".").map(Number); if(a<22||(a===22&&b<12))process.exit(1)'
command -v npm >/dev/null || { echo 'npm is required to bootstrap pinned Bun 1.4.2' >&2; exit 1; }
command -v python3 >/dev/null || { echo 'Python 3 is required for the marketplace branch-history check' >&2; exit 1; }
TOOLS="${XDG_CACHE_HOME:-$HOME/.cache}/hillstreet-codex/bun-1.4.2"
BUN="$TOOLS/node_modules/.bin/bun"
if [[ ! -x "$BUN" ]]; then
  # Keep the private bootstrap cache restricted without making project dependencies owner-only.
  ORIGINAL_UMASK="$(umask)"
  umask 077
  npm install --prefix "$TOOLS" --no-save --package-lock=false bun@1.4.2
  umask "$ORIGINAL_UMASK"
fi
BUN_VERSION="$("$BUN" --version)"
[[ "$BUN_VERSION" == "1.4.2" ]] || { echo "Expected Bun 1.4.2, found $BUN_VERSION" >&2; exit 1; }
if [[ "$MODE" == install ]]; then
  "$BUN" install --frozen-lockfile
  echo 'Development dependencies installed; provider access is not implied.'
else
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
