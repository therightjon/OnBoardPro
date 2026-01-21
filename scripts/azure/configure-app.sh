#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_common.sh"

require_env AZ_RESOURCE_GROUP
require_env AZ_APP_NAME
require_env SESSION_SECRET
ensure_az_login

APP_BASE_URL="${APP_BASE_URL:-https://${AZ_APP_NAME}.azurewebsites.net}"
BASE_URL="${BASE_URL:-$APP_BASE_URL}"

if [[ -z "${DATABASE_URL:-}" ]]; then
  if [[ "${AZ_CREATE_DB:-0}" == "1" ]]; then
    require_env AZ_POSTGRES_SERVER
    require_env AZ_POSTGRES_DB
    require_env AZ_POSTGRES_ADMIN_USER
    require_env AZ_POSTGRES_ADMIN_PASSWORD
    DATABASE_URL="postgresql://${AZ_POSTGRES_ADMIN_USER}:${AZ_POSTGRES_ADMIN_PASSWORD}@${AZ_POSTGRES_SERVER}.postgres.database.azure.com:5432/${AZ_POSTGRES_DB}?sslmode=require"
  else
    echo "DATABASE_URL is required. Set it in scripts/azure/vars.env." >&2
    exit 1
  fi
fi

APP_SETTINGS=(
  "NODE_ENV=production"
  "APP_BASE_URL=${APP_BASE_URL}"
  "BASE_URL=${BASE_URL}"
  "DATABASE_URL=${DATABASE_URL}"
  "SESSION_SECRET=${SESSION_SECRET}"
  "SCM_DO_BUILD_DURING_DEPLOYMENT=false"
  "ENABLE_ORYX_BUILD=false"
)

append_if_set COOKIE_DOMAIN
append_if_set TRUSTED_PROXIES
append_if_set SESSION_IDLE_TIMEOUT_HOURS
append_if_set SESSION_ABSOLUTE_TIMEOUT_HOURS
append_if_set RATE_LIMIT_WINDOW_MS
append_if_set RATE_LIMIT_MAX
append_if_set SENSITIVE_RATE_LIMIT_WINDOW_MS
append_if_set SENSITIVE_RATE_LIMIT_MAX
append_if_set DISABLE_DEADLINE_SCANNER
append_if_set DISABLE_EMAIL_JOBS
append_if_set DISABLE_NOTIFICATION_CLEANUP
append_if_set SMTP_HOST
append_if_set SMTP_PORT
append_if_set SMTP_USER
append_if_set SMTP_PASSWORD
append_if_set ENABLE_GOOGLE_AUTH
append_if_set GOOGLE_CLIENT_ID
append_if_set GOOGLE_CLIENT_SECRET
append_if_set ENABLE_AZURE_AUTH
append_if_set AZURE_CLIENT_ID
append_if_set AZURE_CLIENT_SECRET
append_if_set AZURE_TENANT_ID
append_if_set ENABLE_LDAP_AUTH
append_if_set LDAP_URL
append_if_set LDAP_BIND_DN
append_if_set LDAP_BIND_PASSWORD
append_if_set LDAP_SEARCH_BASE
append_if_set LDAP_SEARCH_FILTER

log "Setting App Service configuration"
az webapp config appsettings set \
  --resource-group "$AZ_RESOURCE_GROUP" \
  --name "$AZ_APP_NAME" \
  --settings "${APP_SETTINGS[@]}" \
  >/dev/null

log "App settings updated"
