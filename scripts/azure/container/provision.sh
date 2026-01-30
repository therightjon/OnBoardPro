#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_common.sh"

require_env AZ_RESOURCE_GROUP
require_env AZ_LOCATION
require_env AZ_CONTAINERAPP_ENV
require_env AZ_CONTAINERAPP_NAME
require_env AZ_ACR_NAME
DB_PRIVATE_MODE="${AZ_DB_PRIVATE:-0}"

if [[ "$DB_PRIVATE_MODE" == "1" ]]; then
  require_env AZ_VNET_NAME
  require_env AZ_VNET_PREFIX
  require_env AZ_INFRA_SUBNET_NAME
  require_env AZ_INFRA_SUBNET_PREFIX
  require_env AZ_DB_SUBNET_NAME
  require_env AZ_DB_SUBNET_PREFIX
  require_env AZ_PRIVATE_DNS_ZONE
fi
require_env AZ_POSTGRES_SERVER
require_env AZ_POSTGRES_DB
require_env AZ_POSTGRES_ADMIN_USER
require_env AZ_POSTGRES_ADMIN_PASSWORD
PUBLIC_ACCESS_MODE="${AZ_DB_PUBLIC_ACCESS:-Enabled}"
ensure_az_login

log "Creating resource group"
az group create --name "$AZ_RESOURCE_GROUP" --location "$AZ_LOCATION" >/dev/null

if [[ "$DB_PRIVATE_MODE" == "1" ]]; then
  log "Creating VNet and subnets"
  if ! az network vnet show --resource-group "$AZ_RESOURCE_GROUP" --name "$AZ_VNET_NAME" >/dev/null 2>&1; then
    az network vnet create \
      --resource-group "$AZ_RESOURCE_GROUP" \
      --name "$AZ_VNET_NAME" \
      --address-prefixes "$AZ_VNET_PREFIX" \
      --subnet-name "$AZ_INFRA_SUBNET_NAME" \
      --subnet-prefixes "$AZ_INFRA_SUBNET_PREFIX" \
      >/dev/null
  fi

  az network vnet subnet update \
    --resource-group "$AZ_RESOURCE_GROUP" \
    --vnet-name "$AZ_VNET_NAME" \
    --name "$AZ_INFRA_SUBNET_NAME" \
    --delegations "Microsoft.App/environments" \
    >/dev/null

  if ! az network vnet subnet show --resource-group "$AZ_RESOURCE_GROUP" --vnet-name "$AZ_VNET_NAME" --name "$AZ_DB_SUBNET_NAME" >/dev/null 2>&1; then
    az network vnet subnet create \
      --resource-group "$AZ_RESOURCE_GROUP" \
      --vnet-name "$AZ_VNET_NAME" \
      --name "$AZ_DB_SUBNET_NAME" \
      --address-prefixes "$AZ_DB_SUBNET_PREFIX" \
      --delegations "Microsoft.DBforPostgreSQL/flexibleServers" \
      >/dev/null
  else
    az network vnet subnet update \
      --resource-group "$AZ_RESOURCE_GROUP" \
      --vnet-name "$AZ_VNET_NAME" \
      --name "$AZ_DB_SUBNET_NAME" \
      --delegations "Microsoft.DBforPostgreSQL/flexibleServers" \
      >/dev/null
  fi

  log "Creating Private DNS zone"
  if ! az network private-dns zone show --resource-group "$AZ_RESOURCE_GROUP" --name "$AZ_PRIVATE_DNS_ZONE" >/dev/null 2>&1; then
    az network private-dns zone create \
      --resource-group "$AZ_RESOURCE_GROUP" \
      --name "$AZ_PRIVATE_DNS_ZONE" \
      >/dev/null
  fi

  log "Linking DNS zone to VNet"
  DNS_LINK_NAME="${AZ_VNET_NAME}-link"
  if ! az network private-dns link vnet show --resource-group "$AZ_RESOURCE_GROUP" --zone-name "$AZ_PRIVATE_DNS_ZONE" --name "$DNS_LINK_NAME" >/dev/null 2>&1; then
    az network private-dns link vnet create \
      --resource-group "$AZ_RESOURCE_GROUP" \
      --zone-name "$AZ_PRIVATE_DNS_ZONE" \
      --name "$DNS_LINK_NAME" \
      --virtual-network "$AZ_VNET_NAME" \
      --registration-enabled false \
      >/dev/null
  fi
else
  log "Skipping VNet/private DNS (AZ_DB_PRIVATE=0)"
fi

log "Creating PostgreSQL flexible server"
if ! az postgres flexible-server show --resource-group "$AZ_RESOURCE_GROUP" --name "$AZ_POSTGRES_SERVER" >/dev/null 2>&1; then
  CREATE_ARGS=(\
    az postgres flexible-server create \
    --resource-group "$AZ_RESOURCE_GROUP" \
    --name "$AZ_POSTGRES_SERVER" \
    --location "$AZ_LOCATION" \
    --admin-user "$AZ_POSTGRES_ADMIN_USER" \
    --admin-password "$AZ_POSTGRES_ADMIN_PASSWORD" \
    --version "${AZ_POSTGRES_VERSION:-16}" \
    --tier "${AZ_POSTGRES_TIER:-Burstable}" \
    --sku-name "${AZ_POSTGRES_SKU:-Standard_B1ms}" \
    --storage-size "${AZ_POSTGRES_STORAGE_GB:-32}" \
    --public-access "$PUBLIC_ACCESS_MODE" \
  )

  if [[ "$DB_PRIVATE_MODE" == "1" ]]; then
    CREATE_ARGS+=(--vnet "$AZ_VNET_NAME" --subnet "$AZ_DB_SUBNET_NAME" --private-dns-zone "$AZ_PRIVATE_DNS_ZONE")
  fi

  "${CREATE_ARGS[@]}" >/dev/null
fi

log "Creating database"
az postgres flexible-server db create \
  --resource-group "$AZ_RESOURCE_GROUP" \
  --server-name "$AZ_POSTGRES_SERVER" \
  --database-name "$AZ_POSTGRES_DB" \
  >/dev/null

log "Enabling public access on PostgreSQL"
az postgres flexible-server update \
  --resource-group "$AZ_RESOURCE_GROUP" \
  --name "$AZ_POSTGRES_SERVER" \
  --public-access "$PUBLIC_ACCESS_MODE" \
  >/dev/null

for attempt in {1..10}; do
  CURRENT_ACCESS=$(az postgres flexible-server show \
    --resource-group "$AZ_RESOURCE_GROUP" \
    --name "$AZ_POSTGRES_SERVER" \
    --query "network.publicNetworkAccess" \
    --output tsv)
  if [[ "$CURRENT_ACCESS" == "Enabled" ]]; then
    break
  fi
  if [[ "$attempt" == "5" ]]; then
    az postgres flexible-server update \
      --resource-group "$AZ_RESOURCE_GROUP" \
      --name "$AZ_POSTGRES_SERVER" \
      --public-access Enabled \
      >/dev/null
  fi
  sleep 3
done

CURRENT_ACCESS=$(az postgres flexible-server show \
  --resource-group "$AZ_RESOURCE_GROUP" \
  --name "$AZ_POSTGRES_SERVER" \
  --query "network.publicNetworkAccess" \
  --output tsv)
if [[ "$CURRENT_ACCESS" != "Enabled" ]]; then
  echo "Public access is still disabled on $AZ_POSTGRES_SERVER (current: $CURRENT_ACCESS). Skipping firewall rules." >&2
  DB_PUBLIC_IPS=""
fi

read -r -p "Enter comma-separated public IPs or ranges to allow (leave blank to skip): " DB_PUBLIC_IPS
if [[ -n "${DB_PUBLIC_IPS:-}" ]]; then
  IFS=',' read -r -a IP_LIST <<< "$DB_PUBLIC_IPS"
  for ip in "${IP_LIST[@]}"; do
    ip="$(echo "$ip" | xargs)"
    if [[ -z "$ip" ]]; then
      continue
    fi
    RULE_NAME="manual-${ip//./-}"
    RULE_NAME="${RULE_NAME//\//-}"
    RULE_NAME="${RULE_NAME//:/-}"
    az postgres flexible-server firewall-rule create \
      --resource-group "$AZ_RESOURCE_GROUP" \
      --name "$AZ_POSTGRES_SERVER" \
      --rule-name "$RULE_NAME" \
      --start-ip-address "${ip%-*}" \
      --end-ip-address "${ip#*-}" \
      >/dev/null
  done
  log "Firewall rules updated"
else
  log "Skipping firewall rules (no IPs provided)"
fi

log "Creating Azure Container Registry"
if ! az acr show --resource-group "$AZ_RESOURCE_GROUP" --name "$AZ_ACR_NAME" >/dev/null 2>&1; then
  az acr create \
    --resource-group "$AZ_RESOURCE_GROUP" \
    --name "$AZ_ACR_NAME" \
    --sku Basic \
    --admin-enabled true \
    >/dev/null
fi

log "Creating Container Apps environment"
if ! az containerapp env show --resource-group "$AZ_RESOURCE_GROUP" --name "$AZ_CONTAINERAPP_ENV" >/dev/null 2>&1; then
  if [[ "$DB_PRIVATE_MODE" == "1" ]]; then
    INFRA_SUBNET_ID=$(az network vnet subnet show \
      --resource-group "$AZ_RESOURCE_GROUP" \
      --vnet-name "$AZ_VNET_NAME" \
      --name "$AZ_INFRA_SUBNET_NAME" \
      --query id \
      --output tsv)

    az containerapp env create \
      --resource-group "$AZ_RESOURCE_GROUP" \
      --name "$AZ_CONTAINERAPP_ENV" \
      --location "$AZ_LOCATION" \
      --infrastructure-subnet-resource-id "$INFRA_SUBNET_ID" \
      >/dev/null
  else
    az containerapp env create \
      --resource-group "$AZ_RESOURCE_GROUP" \
      --name "$AZ_CONTAINERAPP_ENV" \
      --location "$AZ_LOCATION" \
      >/dev/null
  fi
fi

log "Provisioning complete"
