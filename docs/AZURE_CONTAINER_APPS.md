# Azure Container Apps Deployment (VNet + Private PostgreSQL)

This guide deploys OnBoardPro to Azure Container Apps with a private Postgres Flexible Server in the same VNet.

## Prereqs
- Azure CLI (`az`) installed and logged in.
- Container Apps extension: `az extension add --name containerapp`.
- Dockerfile in repo root (included).

## Setup
1) Copy the env template:
   ```bash
   cp scripts/azure/container/vars.env.example scripts/azure/container/vars.env
   ```
2) Edit `scripts/azure/container/vars.env` with your values.

Notes:
- `AZ_ACR_NAME` must be lowercase letters/numbers only.
- `SESSION_SECRET` must be at least 32 characters.
- `AZ_INFRA_SUBNET_PREFIX` must be /23 or larger.
- `AZ_DB_PRIVATE=0` (default) creates a public Postgres server restricted to your IPs.
- Set `AZ_DB_PRIVATE=1` to create a private Postgres server in the VNet.

## Provision infrastructure
```bash
bash scripts/azure/container/provision.sh
```
This creates the resource group, Postgres server + DB, ACR, and Container Apps environment.
If `AZ_DB_PRIVATE=1`, it also creates the VNet, delegated subnets, and private DNS zone.
It will enable public access on the Postgres server and prompt you for public IPs or ranges to allow (when public access is enabled).
If public access cannot be enabled (for example, due to private-only restrictions), the script will skip firewall rules and continue.

Example input:
```
203.0.113.25,198.51.100.10-198.51.100.20
```

## Build + deploy container
```bash
bash scripts/azure/container/deploy.sh
```
The deploy script adds a timestamp-based revision suffix so each deploy creates a new revision even if you reuse the same image tag. You can override with `AZ_REVISION_SUFFIX` in the env file.

## Rebuild + restart
Rebuild and deploy a new revision:
```bash
set -a
source scripts/azure/container/vars.env
set +a

bash scripts/azure/container/deploy.sh
```

Push updated app settings (env vars) to the Container App:
```bash
set -a
source scripts/azure/container/vars.env
set +a

bash scripts/azure/container/configure-app.sh
```

Restart the latest active revision (no rebuild):
```bash
set -a
source scripts/azure/container/vars.env
set +a

REV=$(az containerapp show -g "$AZ_RESOURCE_GROUP" -n "$AZ_CONTAINERAPP_NAME" \
  --query "properties.latestRevisionName" -o tsv)
az containerapp revision restart -g "$AZ_RESOURCE_GROUP" -n "$AZ_CONTAINERAPP_NAME" --revision "$REV"
```

## Configure app settings
```bash
bash scripts/azure/container/configure-app.sh
```

If `APP_BASE_URL`/`BASE_URL` are empty in the env file, the script will pull the Container App FQDN and set them automatically.

## Run migrations
```bash
DATABASE_URL="<private-connection-string>" npm run db:push
```
Note: if you keep public access enabled, you can run migrations from your Mac. Otherwise use a VM inside the VNet.

## Restore database from a dump (delete + recreate + restore)
This repo includes a helper script that deletes and recreates the database, then restores a `pg_dump` plain SQL file via `psql`:

```bash
bash scripts/azure/container/restore-db.sh /absolute/or/relative/path/to/database_dump.sql
```

Notes:
- The script reads `scripts/azure/container/vars.env` by default. Override with `AZ_ENV_FILE=/path/to/vars.env`.
- Requires `psql` to be installed locally (it restores using `psql`, not Beekeeper Studio).
- It will **DROP** and recreate `AZ_POSTGRES_DB` on `AZ_POSTGRES_SERVER`.
- It allowlists any `CREATE EXTENSION ...` entries via the server setting `azure.extensions` (required on Azure Flexible Server).
- If the dump was created from a newer Postgres major version than your server, restore may fail; best practice is to dump/restore on the same major version.
- If your database is private/VNet-only, run the restore from inside the VNet (or temporarily enable public access + firewall rules).

## Disable public access (lock down)
```bash
az postgres flexible-server firewall-rule delete \
  --resource-group <rg> \
  --name <server> \
  --rule-name <rule-name>

az postgres flexible-server update \
  --resource-group <rg> \
  --name <server> \
  --public-access Disabled
```

## Troubleshooting
- Show Container App status:
  ```bash
  az containerapp show -g <rg> -n <app> --query "{fqdn:properties.configuration.ingress.fqdn, state:properties.provisioningState}" -o json
  ```
- Stream logs:
  ```bash
  az containerapp logs show -g <rg> -n <app> --follow
  ```

## GitHub Actions (optional)
This repo includes `.github/workflows/azure-containerapp-deploy.yml` for manual deployments.

Required GitHub Secrets:
- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`
- `AZ_POSTGRES_ADMIN_PASSWORD`
- `SESSION_SECRET`

Optional Secrets (if used):
- `DATABASE_URL` (leave empty to auto-build from Postgres vars)
- `SMTP_PASSWORD`
- `GOOGLE_CLIENT_SECRET`
- `AZURE_CLIENT_SECRET`
- `LDAP_BIND_PASSWORD`

Required GitHub Variables (recommended defaults are in the workflow):
- `AZ_LOCATION`
- `AZ_RESOURCE_GROUP`
- `AZ_CONTAINERAPP_ENV`
- `AZ_CONTAINERAPP_NAME`
- `AZ_ACR_NAME`
- `AZ_IMAGE_NAME`
- `AZ_POSTGRES_SERVER`
- `AZ_POSTGRES_DB`
- `AZ_POSTGRES_ADMIN_USER`

Optional Variables:
- Any of the app settings in `scripts/azure/container/vars.env.example`

Permissions: the Azure identity must have rights to build in ACR and update the Container App (Contributor on the resource group is sufficient).
