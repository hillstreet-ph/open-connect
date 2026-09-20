#!/usr/bin/env bash
set -euo pipefail

# Preserve the generated catalog while merging both published histories.
branch=automation/marketplace-catalog-sync
catalog=config/marketplace-candidates.generated.json
snapshot=$(mktemp)
trap 'rm -f "$snapshot"' EXIT
cp "$catalog" "$snapshot"
git restore --source=HEAD -- "$catalog"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "Refusing to update a branch with unrelated tracked changes." >&2
  exit 1
fi
git fetch origin main
if git ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1; then
  git fetch origin "$branch:refs/remotes/origin/$branch"
  if git show-ref --verify --quiet "refs/heads/$branch"; then
    git switch "$branch"
    git merge --ff-only "origin/$branch"
  else
    git switch --create "$branch" --track "origin/$branch"
  fi
  git merge --no-edit --no-ff origin/main
else
  git switch --create "$branch" origin/main
fi
cp "$snapshot" "$catalog"
git add -- "$catalog"
if ! git diff --cached --quiet; then
  git commit -m "chore(marketplace): refresh source candidates for review"
fi
git push origin "HEAD:refs/heads/$branch"
