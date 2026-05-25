#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/home/el/projects/neuronpress"
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-$APP_DIR/.deploy.local}"

if [[ -f "$DEPLOY_ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$DEPLOY_ENV_FILE"
fi

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # shellcheck disable=SC1090
  source "$NVM_DIR/nvm.sh"
fi

cd "$APP_DIR"

DEPLOY_ENV_FILE="$DEPLOY_ENV_FILE" bash scripts/deploy-convex.sh
DEPLOY_ENV_FILE="$DEPLOY_ENV_FILE" bash scripts/deploy-frontend.sh

echo "Full deployment complete: Convex + frontend"
