#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_common.sh"

require_env AZ_RESOURCE_GROUP
require_env AZ_CONTAINERAPP_ENV
require_env AZ_CONTAINERAPP_NAME
require_env AZ_ACR_NAME
require_env AZ_IMAGE_NAME
require_env AZ_IMAGE_TAG
ensure_az_login

REV_SUFFIX="${AZ_REVISION_SUFFIX:-$(date +%Y%m%d%H%M%S)}"

log "Building container image in ACR"
az acr build \
  --resource-group "$AZ_RESOURCE_GROUP" \
  --registry "$AZ_ACR_NAME" \
  --image "${AZ_IMAGE_NAME}:${AZ_IMAGE_TAG}" \
  "$ROOT_DIR" \
  >/dev/null

REGISTRY_SERVER="${AZ_ACR_NAME}.azurecr.io"
IMAGE_REF="${REGISTRY_SERVER}/${AZ_IMAGE_NAME}:${AZ_IMAGE_TAG}"

log "Ensuring Container App exists"
if ! az containerapp show --resource-group "$AZ_RESOURCE_GROUP" --name "$AZ_CONTAINERAPP_NAME" >/dev/null 2>&1; then
  ACR_USER=$(az acr credential show --name "$AZ_ACR_NAME" --query username -o tsv)
  ACR_PASS=$(az acr credential show --name "$AZ_ACR_NAME" --query "passwords[0].value" -o tsv)

  az containerapp create \
    --resource-group "$AZ_RESOURCE_GROUP" \
    --name "$AZ_CONTAINERAPP_NAME" \
    --environment "$AZ_CONTAINERAPP_ENV" \
    --image "$IMAGE_REF" \
    --revision-suffix "$REV_SUFFIX" \
    --registry-server "$REGISTRY_SERVER" \
    --registry-username "$ACR_USER" \
    --registry-password "$ACR_PASS" \
    --ingress external \
    --target-port "${AZ_CONTAINERAPP_PORT:-5000}" \
    --cpu "${AZ_CONTAINERAPP_CPU:-1.0}" \
    --memory "${AZ_CONTAINERAPP_MEMORY:-2Gi}" \
    --min-replicas "${AZ_CONTAINERAPP_MIN_REPLICAS:-1}" \
    --max-replicas "${AZ_CONTAINERAPP_MAX_REPLICAS:-3}" \
    >/dev/null
else
  az containerapp update \
    --resource-group "$AZ_RESOURCE_GROUP" \
    --name "$AZ_CONTAINERAPP_NAME" \
    --image "$IMAGE_REF" \
    --revision-suffix "$REV_SUFFIX" \
    >/dev/null
fi

log "Deployment complete"
