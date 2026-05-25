#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/el/projects/passivepress"
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-$APP_DIR/.deploy.local}"
REMOTE_NAME="${REMOTE_NAME:-origin}"
DRY_RUN="${DRY_RUN:-0}"

load_env_file() {
  local env_file="$1"
  [[ -f "$env_file" ]] || return 0

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" == *=* ]] || continue
    local key="${line%%=*}"
    local value="${line#*=}"
    key="${key#export }"
    export "$key=$value"
  done < "$env_file"
}

load_env_file "$DEPLOY_ENV_FILE"

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # shellcheck disable=SC1090
  source "$NVM_DIR/nvm.sh"
fi

cd "$APP_DIR"

BRANCH="${DEPLOY_BRANCH:-$(git branch --show-current)}"
if [[ -z "$BRANCH" ]]; then
  echo "Could not detect the current git branch. Set DEPLOY_BRANCH explicitly." >&2
  exit 1
fi

COMMIT_MESSAGE="${DEPLOY_COMMIT_MESSAGE:-deploy: Cloudflare Pages sync $(date -u +'%Y-%m-%d %H:%M:%S UTC')}"

echo "Regenerating sitemap from live Convex data..."
node scripts/generate-sitemap.mjs

echo "Building frontend before push..."
pnpm build

echo "Staging repository changes for branch: $BRANCH"
git add -A

if [[ "$DRY_RUN" == "1" ]]; then
  echo "DRY_RUN=1 → skipping commit and push"
  git status --short
  exit 0
fi

if git diff --cached --quiet; then
  echo "No staged changes to commit. Pushing current branch state to $REMOTE_NAME/$BRANCH"
else
  git commit -m "$COMMIT_MESSAGE"
fi

git push "$REMOTE_NAME" "$BRANCH"

echo "Frontend deployment triggered via Git push to $REMOTE_NAME/$BRANCH"
echo "Cloudflare Pages will build from the pushed repository state"
