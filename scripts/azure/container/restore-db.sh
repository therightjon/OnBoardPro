#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Loads env (AZ_ENV_FILE or scripts/azure/container/vars.env) + helpers (require_env, ensure_az_login, log, ...)
# shellcheck disable=SC1091
source "$SCRIPT_DIR/_common.sh"

usage() {
  cat <<'EOF'
Usage:
  scripts/azure/container/restore-db.sh /absolute/or/relative/path/to/pg_dump.sql

Behavior:
  - Deletes and recreates AZ_POSTGRES_DB on AZ_POSTGRES_SERVER (Flexible Server)
  - Ensures any roles referenced by "OWNER TO ..." exist (creates NOLOGIN roles)
  - Grants USAGE,CREATE on schema public to those roles (so OWNER changes work)
  - Allowlists any extensions referenced by "CREATE EXTENSION ..." via azure.extensions
  - Restores the dump via psql

Config:
  - By default reads scripts/azure/container/vars.env
  - Override env file path with: AZ_ENV_FILE=/path/to/vars.env scripts/azure/container/restore-db.sh dump.sql
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || -z "${1:-}" ]]; then
  usage
  exit 0
fi

DUMP_PATH="$1"
if [[ ! -f "$DUMP_PATH" ]]; then
  echo "Dump file not found: $DUMP_PATH" >&2
  exit 1
fi

require_command az
require_command psql
require_command awk
require_command sed

require_env AZ_RESOURCE_GROUP
require_env AZ_POSTGRES_SERVER
require_env AZ_POSTGRES_DB
require_env AZ_POSTGRES_ADMIN_USER
require_env AZ_POSTGRES_ADMIN_PASSWORD

ensure_az_login

FQDN="$(az postgres flexible-server show \
  --resource-group "$AZ_RESOURCE_GROUP" \
  --name "$AZ_POSTGRES_SERVER" \
  --query fullyQualifiedDomainName \
  --output tsv)"

SERVER_VERSION="$(az postgres flexible-server show \
  --resource-group "$AZ_RESOURCE_GROUP" \
  --name "$AZ_POSTGRES_SERVER" \
  --query version \
  --output tsv)"

if [[ -z "$FQDN" ]]; then
  echo "Failed to resolve server FQDN for: $AZ_POSTGRES_SERVER" >&2
  exit 1
fi

log "Target server: $AZ_POSTGRES_SERVER ($FQDN), version: $SERVER_VERSION"
log "Target database: $AZ_POSTGRES_DB"
log "Dump: $DUMP_PATH"

RESTORE_FILE="$DUMP_PATH"
TMP_RESTORE_FILE=""
cleanup() {
  if [[ -n "${TMP_RESTORE_FILE:-}" && -f "${TMP_RESTORE_FILE:-}" ]]; then
    rm -f "$TMP_RESTORE_FILE"
  fi
}
trap cleanup EXIT

# pg_dump 17+ emits SET transaction_timeout, but PG16 doesn't recognize it.
if [[ "$SERVER_VERSION" =~ ^[0-9]+$ ]] && (( SERVER_VERSION < 17 )); then
  if awk 'BEGIN{found=0} /^SET[[:space:]]+transaction_timeout[[:space:]]*=/{found=1} END{exit(found?0:1)}' "$DUMP_PATH"; then
    TMP_RESTORE_FILE="$(mktemp "${TMPDIR:-/tmp}/onboardpro-restore.XXXXXX.sql")"
    sed '/^SET[[:space:]]\+transaction_timeout[[:space:]]*=.*;[[:space:]]*$/d' "$DUMP_PATH" >"$TMP_RESTORE_FILE"
    RESTORE_FILE="$TMP_RESTORE_FILE"
    log "Filtered unsupported setting for PG$SERVER_VERSION: transaction_timeout"
  fi
fi

# Extract extensions and ensure they're allowlisted on Azure (server-level setting).
mapfile -t REQUIRED_EXTENSIONS < <(
  awk '
    match($0, /^CREATE EXTENSION IF NOT EXISTS[[:space:]]+([A-Za-z0-9_]+)[[:space:]]/, m) { print m[1] }
  ' "$RESTORE_FILE" | sort -u
)

if (( ${#REQUIRED_EXTENSIONS[@]} > 0 )); then
  CURRENT_EXTS="$(az postgres flexible-server parameter show \
    --resource-group "$AZ_RESOURCE_GROUP" \
    --server-name "$AZ_POSTGRES_SERVER" \
    --name azure.extensions \
    --query value \
    --output tsv)"

  # Merge current + required into a comma-separated set (order not important).
  REQUIRED_CSV="$(IFS=,; echo "${REQUIRED_EXTENSIONS[*]}")"
  DESIRED_EXTS="$(
    awk -v a="$CURRENT_EXTS" -v b="$REQUIRED_CSV" '
      BEGIN{
        n=split(a,A,/,/); for(i=1;i<=n;i++) if(A[i]!="") s[A[i]]=1
        m=split(b,B,/,/); for(i=1;i<=m;i++) if(B[i]!="") s[B[i]]=1
        first=1
        for(k in s){
          if(!first) printf ","
          printf "%s", k
          first=0
        }
      }
    '
  )"

  if [[ "$DESIRED_EXTS" != "$CURRENT_EXTS" ]]; then
    log "Allowlisting extensions (azure.extensions): $DESIRED_EXTS"
    az postgres flexible-server parameter set \
      --resource-group "$AZ_RESOURCE_GROUP" \
      --server-name "$AZ_POSTGRES_SERVER" \
      --name azure.extensions \
      --value "$DESIRED_EXTS" \
      >/dev/null
  fi
fi

# Extract any roles referenced by OWNER TO ... and create them if missing.
mapfile -t OWNER_ROLES < <(
  awk '
    match($0, /OWNER TO[[:space:]]+([^;]+);/, m) {
      r=m[1]
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", r)
      gsub(/^"/, "", r); gsub(/"$/, "", r)
      if (r != "") print r
    }
  ' "$RESTORE_FILE" | sort -u
)

export PGPASSWORD="$AZ_POSTGRES_ADMIN_PASSWORD"

for role in "${OWNER_ROLES[@]}"; do
  # Don't try to recreate the admin role if it appears.
  if [[ "$role" == "$AZ_POSTGRES_ADMIN_USER" ]]; then
    continue
  fi
  log "Ensuring role exists: $role"
  psql "host=$FQDN port=5432 dbname=postgres user=$AZ_POSTGRES_ADMIN_USER sslmode=require" \
    -v ON_ERROR_STOP=1 \
    -v rolename="$role" \
    -c "DO \$\$BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'rolename') THEN EXECUTE format('CREATE ROLE %I', :'rolename'); END IF; END\$\$;" \
    >/dev/null
done

log "Deleting database (if it exists): $AZ_POSTGRES_DB"
az postgres flexible-server db delete \
  --resource-group "$AZ_RESOURCE_GROUP" \
  --server-name "$AZ_POSTGRES_SERVER" \
  --database-name "$AZ_POSTGRES_DB" \
  --yes \
  >/dev/null

log "Creating database: $AZ_POSTGRES_DB"
az postgres flexible-server db create \
  --resource-group "$AZ_RESOURCE_GROUP" \
  --server-name "$AZ_POSTGRES_SERVER" \
  --database-name "$AZ_POSTGRES_DB" \
  >/dev/null

# Azure often locks down public schema ownership/privileges; OWNER TO needs the new owner to have CREATE on schema.
for role in "${OWNER_ROLES[@]}"; do
  if [[ "$role" == "$AZ_POSTGRES_ADMIN_USER" ]]; then
    continue
  fi
  log "Granting schema privileges on public to: $role"
  psql "host=$FQDN port=5432 dbname=$AZ_POSTGRES_DB user=$AZ_POSTGRES_ADMIN_USER sslmode=require" \
    -v ON_ERROR_STOP=1 \
    -v rolename="$role" \
    -c "DO \$\$BEGIN EXECUTE format('GRANT USAGE, CREATE ON SCHEMA public TO %I', :'rolename'); END\$\$;" \
    >/dev/null
done

log "Restoring dump (this may take a bit)"
psql "host=$FQDN port=5432 dbname=$AZ_POSTGRES_DB user=$AZ_POSTGRES_ADMIN_USER sslmode=require" \
  -v ON_ERROR_STOP=1 \
  -f "$RESTORE_FILE"

unset PGPASSWORD

log "Restore complete"

