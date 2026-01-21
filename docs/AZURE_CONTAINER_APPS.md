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

## Provision infrastructure
```bash
bash scripts/azure/container/provision.sh
```
This creates the resource group, VNet, delegated subnets, private DNS zone, Postgres server + DB, ACR, and Container Apps environment.

## Build + deploy container
```bash
bash scripts/azure/container/deploy.sh
```
The deploy script adds a timestamp-based revision suffix so each deploy creates a new revision even if you reuse the same image tag. You can override with `AZ_REVISION_SUFFIX` in the env file.

## Configure app settings
```bash
bash scripts/azure/container/configure-app.sh
```

If `APP_BASE_URL`/`BASE_URL` are empty in the env file, the script will pull the Container App FQDN and set them automatically.

## Run migrations
```bash
DATABASE_URL="<private-connection-string>" npm run db:push
```
Note: the database is private. Run migrations from a VM or tool inside the VNet, or temporarily enable public access to run `db:push` and then disable it again.

## Troubleshooting
- Show Container App status:
  ```bash
  az containerapp show -g <rg> -n <app> --query "{fqdn:properties.configuration.ingress.fqdn, state:properties.provisioningState}" -o json
  ```
- Stream logs:
  ```bash
  az containerapp logs show -g <rg> -n <app> --follow
  ```
