#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_common.sh"

require_env AZ_RESOURCE_GROUP
require_env AZ_CONTAINERAPP_ENV
require_env AZ_CONTAINERAPP_NAME
require_env AZ_POSTGRES_SERVER
require_env AZ_POSTGRES_DB
require_env AZ_POSTGRES_ADMIN_USER
require_env AZ_POSTGRES_ADMIN_PASSWORD
ensure_az_login

if [[ -z "${DATABASE_URL:-}" ]]; then
  DATABASE_URL="postgresql://${AZ_POSTGRES_ADMIN_USER}:${AZ_POSTGRES_ADMIN_PASSWORD}@${AZ_POSTGRES_SERVER}.postgres.database.azure.com:5432/${AZ_POSTGRES_DB}?sslmode=require"
fi

if [[ -z "${APP_BASE_URL:-}" || -z "${BASE_URL:-}" ]]; then
  FQDN=$(az containerapp show \
    --resource-group "$AZ_RESOURCE_GROUP" \
    --name "$AZ_CONTAINERAPP_NAME" \
    --query "properties.configuration.ingress.fqdn" \
    --output tsv)
  if [[ -n "$FQDN" ]]; then
    APP_BASE_URL="https://${FQDN}"
    BASE_URL="$APP_BASE_URL"
  fi
fi

APP_ENV_VARS=(
  "NODE_ENV=${NODE_ENV:-production}"
  "PORT=${PORT:-5000}"
  "APP_BASE_URL=${APP_BASE_URL}"
  "BASE_URL=${BASE_URL}"
  "DATABASE_URL=${DATABASE_URL}"
  "SESSION_SECRET=${SESSION_SECRET}"
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
append_if_set AUTH_ENABLE_LDAP
append_if_set LDAP_URL
append_if_set LDAP_STARTTLS
append_if_set LDAP_BIND_DN
append_if_set LDAP_BIND_PASSWORD
append_if_set LDAP_SEARCH_BASE
append_if_set LDAP_BASE_DN
append_if_set LDAP_SEARCH_FILTER
append_if_set LDAP_USER_FILTER
append_if_set LDAP_ATTR_USERNAME
append_if_set LDAP_ATTR_EMAIL
append_if_set LDAP_ATTR_FIRST_NAME
append_if_set LDAP_ATTR_LAST_NAME
append_if_set LDAP_DISABLED_FILTER

log "Updating Container App environment variables"
az containerapp update \
  --resource-group "$AZ_RESOURCE_GROUP" \
  --name "$AZ_CONTAINERAPP_NAME" \
  --set-env-vars "${APP_ENV_VARS[@]}" \
  >/dev/null

log "App settings updated"
