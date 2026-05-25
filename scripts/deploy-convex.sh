#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/el/projects/neuronpress"
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-$APP_DIR/.deploy.local}"
AGENTS_ENV_FILE="$APP_DIR/agents/.env"

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
load_env_file "$AGENTS_ENV_FILE"
load_env_file "$APP_DIR/.env.local"

if [[ -z "${ADMIN_EMAIL:-}" && -n "${VITE_ADMIN_EMAIL:-}" ]]; then
  export ADMIN_EMAIL="$VITE_ADMIN_EMAIL"
fi

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # shellcheck disable=SC1090
  source "$NVM_DIR/nvm.sh"
fi

cd "$APP_DIR"

if [[ -z "${CONVEX_DEPLOY_KEY:-}" ]]; then
  echo "CONVEX_DEPLOY_KEY is not set. Define it in agents/.env or in $DEPLOY_ENV_FILE." >&2
  exit 1
fi

if [[ -z "${ADMIN_EMAIL:-}" ]]; then
  echo "ADMIN_EMAIL is not set. Define it in $DEPLOY_ENV_FILE or set VITE_ADMIN_EMAIL in $APP_DIR/.env.local." >&2
  exit 1
fi

if [[ -n "${CONVEX_SELF_HOSTED_ADMIN_KEY:-}" || -n "${CONVEX_SELF_HOSTED_URL:-}" ]]; then
  echo "Ignoring self-hosted Convex variables for cloud deploy."
fi
unset CONVEX_SELF_HOSTED_ADMIN_KEY
unset CONVEX_SELF_HOSTED_URL

CLOUD_TARGET="${CONVEX_URL:-${VITE_CONVEX_URL:-unknown}}"
echo "Deploying Convex functions to cloud target: $CLOUD_TARGET"
echo "Admin auth configured for: $ADMIN_EMAIL"
pnpm convex deploy --typecheck disable

echo "Convex Cloud deployed successfully"
