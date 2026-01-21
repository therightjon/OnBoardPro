#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_common.sh"

require_env AZ_RESOURCE_GROUP
require_env AZ_APP_NAME
require_env AZ_POSTGRES_SERVER
ensure_az_login

log "Fetching App Service outbound IPs"
OUTBOUND_IPS=$(az webapp show \
  --resource-group "$AZ_RESOURCE_GROUP" \
  --name "$AZ_APP_NAME" \
  --query outboundIpAddresses \
  --output tsv)

if [[ -z "$OUTBOUND_IPS" ]]; then
  echo "No outbound IPs returned for app: $AZ_APP_NAME" >&2
  exit 1
fi

IFS=',' read -r -a IP_ARRAY <<< "$OUTBOUND_IPS"

for ip in "${IP_ARRAY[@]}"; do
  ip="$(echo "$ip" | xargs)"
  if [[ -z "$ip" ]]; then
    continue
  fi

  RULE_NAME="app-${ip//./-}"

  if az postgres flexible-server firewall-rule show \
    --resource-group "$AZ_RESOURCE_GROUP" \
    --name "$AZ_POSTGRES_SERVER" \
    --rule-name "$RULE_NAME" \
    >/dev/null 2>&1; then
    log "Updating firewall rule $RULE_NAME ($ip)"
    az postgres flexible-server firewall-rule update \
      --resource-group "$AZ_RESOURCE_GROUP" \
      --name "$AZ_POSTGRES_SERVER" \
      --rule-name "$RULE_NAME" \
      --start-ip-address "$ip" \
      --end-ip-address "$ip" \
      >/dev/null
  else
    log "Creating firewall rule $RULE_NAME ($ip)"
    az postgres flexible-server firewall-rule create \
      --resource-group "$AZ_RESOURCE_GROUP" \
      --name "$AZ_POSTGRES_SERVER" \
      --rule-name "$RULE_NAME" \
      --start-ip-address "$ip" \
      --end-ip-address "$ip" \
      >/dev/null
  fi

done
