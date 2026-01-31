# Azure Deployment

These scripts deploy OnBoardPro to Azure App Service with an optional Azure Database for PostgreSQL Flexible Server.

If you are deploying to Azure Container Apps, start with `docs/AZURE_CONTAINER_APPS.md` and run:
```bash
bash scripts/azure/container/provision.sh
```

## Prereqs
- Azure CLI (`az`) installed and logged in.
- A Node 22 compatible runtime on App Service (default in scripts).

## Setup
1) Copy the env template:
   ```bash
   cp scripts/azure/vars.env.example scripts/azure/vars.env
   ```
2) Edit `scripts/azure/vars.env` with your values.

Notes:
- `SESSION_SECRET` must be at least 32 characters.
- If your database password includes special characters, set `DATABASE_URL` directly with URL encoding.
- Set `AZ_CREATE_DB=1` to provision a new Azure Postgres Flexible Server.

## Provision
```bash
bash scripts/azure/provision.sh
```

If you enabled `AZ_CREATE_DB=1`, this also creates the database and adds firewall rules for the app outbound IPs.

## Configure app settings
```bash
bash scripts/azure/configure-app.sh
```

## Deploy
```bash
bash scripts/azure/deploy.sh
```

## Run migrations
Apply Drizzle migrations against the Azure database:
```bash
DATABASE_URL="<your-connection-string>" npm run db:push
```

## Restore database from a dump (delete + recreate + restore)
If you have a `pg_dump` plain SQL file and want to wipe and restore the Azure database, you can use the Container Apps restore helper by pointing it at your App Service env file:

```bash
AZ_ENV_FILE=scripts/azure/vars.env bash scripts/azure/container/restore-db.sh /absolute/or/relative/path/to/database_dump.sql
```

Notes:
- This will **DROP** and recreate `AZ_POSTGRES_DB` on `AZ_POSTGRES_SERVER`.
- Requires `psql` to be installed locally.
- The script uses `psql` and may update the server setting `azure.extensions` to allowlist required extensions.

## Update database firewall rules
If the App Service outbound IPs change (scale, region move), re-run:
```bash
bash scripts/azure/update-db-firewall.sh
```

## Troubleshooting
- View live logs:
  ```bash
  az webapp log tail --resource-group <rg> --name <app>
  ```
- Ensure `SCM_DO_BUILD_DURING_DEPLOYMENT=true` is set (the configure script sets it).
- If the runtime string is not available in your region, update `AZ_RUNTIME` in `scripts/azure/vars.env`.
