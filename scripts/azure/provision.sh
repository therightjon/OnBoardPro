#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_common.sh"

require_env AZ_RESOURCE_GROUP
require_env AZ_LOCATION
require_env AZ_APP_SERVICE_PLAN
require_env AZ_APP_NAME
ensure_az_login

log "Creating resource group"
az group create --name "$AZ_RESOURCE_GROUP" --location "$AZ_LOCATION" >/dev/null

log "Creating App Service plan"
az appservice plan create \
  --resource-group "$AZ_RESOURCE_GROUP" \
  --name "$AZ_APP_SERVICE_PLAN" \
  --is-linux \
  --sku "${AZ_APP_PLAN_SKU:-B1}" \
  >/dev/null

log "Creating web app"
az webapp create \
  --resource-group "$AZ_RESOURCE_GROUP" \
  --plan "$AZ_APP_SERVICE_PLAN" \
  --name "$AZ_APP_NAME" \
  --runtime "${AZ_RUNTIME:-NODE|22-lts}" \
  >/dev/null

if [[ "${AZ_CREATE_DB:-0}" == "1" ]]; then
  require_env AZ_POSTGRES_SERVER
  require_env AZ_POSTGRES_DB
  require_env AZ_POSTGRES_ADMIN_USER
  require_env AZ_POSTGRES_ADMIN_PASSWORD

  log "Creating PostgreSQL flexible server"
  CREATE_ARGS=(
    az postgres flexible-server create
    --resource-group "$AZ_RESOURCE_GROUP"
    --name "$AZ_POSTGRES_SERVER"
    --location "$AZ_LOCATION"
    --admin-user "$AZ_POSTGRES_ADMIN_USER"
    --admin-password "$AZ_POSTGRES_ADMIN_PASSWORD"
    --version "${AZ_POSTGRES_VERSION:-16}"
    --tier "${AZ_POSTGRES_TIER:-Burstable}"
    --sku-name "${AZ_POSTGRES_SKU:-Standard_B1ms}"
    --storage-size "${AZ_POSTGRES_STORAGE_GB:-32}"
  )

  if [[ -n "${AZ_POSTGRES_PUBLIC_ACCESS:-}" ]]; then
    CREATE_ARGS+=(--public-access "$AZ_POSTGRES_PUBLIC_ACCESS")
  fi

  "${CREATE_ARGS[@]}" >/dev/null

  log "Creating database"
  az postgres flexible-server db create \
    --resource-group "$AZ_RESOURCE_GROUP" \
    --server-name "$AZ_POSTGRES_SERVER" \
    --database-name "$AZ_POSTGRES_DB" \
    >/dev/null

  "$SCRIPT_DIR/update-db-firewall.sh"
fi

log "Provisioning complete"
