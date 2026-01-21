# Azure Deployment

These scripts deploy OnBoardPro to Azure App Service with an optional Azure Database for PostgreSQL Flexible Server.

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
