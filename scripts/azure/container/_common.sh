#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
ENV_FILE="${AZ_ENV_FILE:-$SCRIPT_DIR/vars.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing env file: $ENV_FILE" >&2
  echo "Copy scripts/azure/container/vars.env.example to scripts/azure/container/vars.env and edit." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required env var: $name" >&2
    exit 1
  fi
}

require_command() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "Missing required command: $name" >&2
    exit 1
  fi
}

ensure_az_login() {
  require_command az
  if ! az account show >/dev/null 2>&1; then
    echo "Not logged in to Azure CLI. Run: az login" >&2
    exit 1
  fi
  if [[ -n "${AZ_SUBSCRIPTION_ID:-}" ]]; then
    az account set --subscription "$AZ_SUBSCRIPTION_ID" >/dev/null
  fi
}

log() {
  printf "\n==> %s\n" "$*"
}

append_if_set() {
  local name="$1"
  local value="${!name:-}"
  if [[ -n "$value" ]]; then
    APP_ENV_VARS+=("${name}=${value}")
  fi
}
