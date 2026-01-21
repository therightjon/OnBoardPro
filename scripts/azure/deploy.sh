#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_common.sh"

require_env AZ_RESOURCE_GROUP
require_env AZ_APP_NAME
ensure_az_login
require_command zip
require_command tar

TMP_DIR="$(mktemp -d)"
BUILD_DIR="$TMP_DIR/build"
ZIP_PATH="$TMP_DIR/onboardpro.zip"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

log "Preparing build workspace"
mkdir -p "$BUILD_DIR"
cd "$ROOT_DIR"
tar --exclude="node_modules" \
  --exclude="dist" \
  --exclude=".git" \
  --exclude=".env" \
  --exclude="scripts/azure/vars.env" \
  --exclude="database_backup_*.sql" \
  -cf - . | (cd "$BUILD_DIR" && tar -xf -)

log "Installing dependencies"
cd "$BUILD_DIR"
npm ci

log "Building app"
npm run build

log "Pruning dev dependencies"
npm prune --omit=dev

log "Creating deployment package"
cd "$BUILD_DIR"
zip -r "$ZIP_PATH" . \
  >/dev/null

log "Deploying to Azure App Service"
az webapp deployment source config-zip \
  --resource-group "$AZ_RESOURCE_GROUP" \
  --name "$AZ_APP_NAME" \
  --src "$ZIP_PATH" \
  --timeout 600 \
  --track-status true \
  >/dev/null

az webapp restart \
  --resource-group "$AZ_RESOURCE_GROUP" \
  --name "$AZ_APP_NAME" \
  >/dev/null

APP_URL="${APP_BASE_URL:-https://${AZ_APP_NAME}.azurewebsites.net}"
log "Deployment complete: $APP_URL"
