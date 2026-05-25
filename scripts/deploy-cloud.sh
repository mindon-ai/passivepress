#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/el/projects/passivepress"
NODE_BIN="/home/el/.nvm/versions/node/v24.14.1/bin/node"
PNPM_BIN="/home/el/.nvm/versions/node/v24.14.1/bin/pnpm"

export PATH="/home/el/.nvm/versions/node/v24.14.1/bin:$PATH"

cd "$APP_DIR"

DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-$APP_DIR/.deploy.local}"
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
load_env_file "agents/.env"

if [[ -z "${CONVEX_DEPLOY_KEY:-}" ]]; then
  echo "CONVEX_DEPLOY_KEY is not set. Define it in agents/.env or in $DEPLOY_ENV_FILE." >&2
  exit 1
fi

unset CONVEX_SELF_HOSTED_ADMIN_KEY
unset CONVEX_SELF_HOSTED_URL

echo "Deploying to Convex Cloud: ${CONVEX_URL:-${VITE_CONVEX_URL:-unknown}}"
$PNPM_BIN convex deploy --typecheck disable

echo "Convex Cloud deployed successfully"
