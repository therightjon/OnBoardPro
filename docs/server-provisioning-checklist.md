# Server Provisioning Meeting Checklist

Use this as the call sheet for the infrastructure meeting and the first-pass RH9 deployment runbook after the server is provisioned.

## What I Need Infra To Provision

- RH9 Linux server with hostname, static IP, and DNS entry.
- Admin access for me: `sudo` and SSH access.
- Final public DNS name for the app.
- TLS/certificate process: whether they issue the cert or I install/manage it.
- Enough CPU, RAM, and SSD storage for app + local PostgreSQL + logs + backups.
- Backup/snapshot policy for the whole VM and confirmation of restore process.
- Patch management / OS hardening ownership.
- Monitoring / log forwarding / endpoint security expectations.

## Network / Firewall

- Open inbound `443/tcp` for users.
- Optional inbound `80/tcp` only for redirect to HTTPS.
- Do not expose PostgreSQL publicly.
- Do not expose the Node app port publicly if possible.
- Allow local loopback traffic on the server for `app -> PostgreSQL` on `5432`.
- Allow local loopback traffic on the server for `reverse proxy -> app` on `5000`.
- Allow outbound internet access for `npm` package install / updates.
- Allow outbound internet access for OS package installs.
- Allow outbound internet access for optional SMTP.
- Allow outbound internet access for optional LDAP/AD.
- Allow outbound internet access for optional OAuth providers.
- Allow outbound internet access for optional Google Fonts.

## Recommended Local Port Layout

- `443` public: Nginx / reverse proxy.
- `80` public optional: redirect only.
- `5000` private/local: Node app.
- `5432` local only: PostgreSQL.

## Important Note Since PostgreSQL Is Local

- Keep PostgreSQL bound to `localhost` or otherwise not externally reachable.
- Confirm where database backups will live and how often they run.
- Confirm disk growth expectations for DB data, logs, and backups on the same server.

## Things To Clarify With Them

- Who owns DNS?
- Who owns TLS cert renewal?
- Is outbound internet unrestricted or do I need package mirrors / proxy access?
- Are there SELinux / `firewalld` standards I need to follow?
- Is a reverse proxy already standard on their Linux servers, or will I install/configure Nginx myself?
- Are there naming standards for service accounts, folders, and `systemd` units?
- Do they want health checks wired to monitoring?
- Do they want logs in journald only or shipped centrally?

## What I Will Set Up Myself After Provisioning

- `Node.js 22` and `npm`
- `nginx`
- `PostgreSQL`
- app code, env file, build, and startup
- `systemd` service for the app
- DB initialization / migrations
- TLS and reverse proxy config if that is my responsibility

## App-Specific Notes To Mention If Needed

- This is one Node app process serving both UI and API.
- PostgreSQL is the only required backend service.
- No Redis, RabbitMQ, Kafka, or separate frontend host is required.
- The app uses secure session cookies, so HTTPS is required in production.
- Health endpoints exist for monitoring.
- The app listens on `0.0.0.0`, so `5000` must not be publicly exposed.
- In production, set both `BASE_URL` and `APP_BASE_URL` to the final HTTPS URL.

## Multi-App Server Recommendation

- Use one runtime service account per app, not one generic shared runtime user.
- Keep the human admin account separate from runtime service accounts.
- Use one PostgreSQL role per app.
- If needed, a generic deployment workflow is fine, but the runtime identity should stay app-specific.

Recommended naming pattern for this app:

- Linux service user: `onboardpro`
- App directory: `/opt/onboardpro/app`
- Env file: `/etc/onboardpro/onboardpro.env`
- `systemd` unit: `onboardpro.service`
- PostgreSQL role: `onboardpro_app`
- PostgreSQL database: `onboardpro`

For future apps on the same server, repeat the same pattern with per-app names.

## Why A Dedicated Service User Exists

- The app runs without `root`.
- File permissions stay isolated to one application.
- Secrets access is narrower.
- Process ownership, logs, and troubleshooting are clearer.
- One compromised app has less direct access to another app's files.

## Recommended On-Server Layout

- App code: `/opt/onboardpro/app`
- Env file: `/etc/onboardpro/onboardpro.env`
- Nginx vhost: `/etc/nginx/conf.d/onboardpro.conf`
- `systemd` unit: `/etc/systemd/system/onboardpro.service`

## Service User And Directory Setup

```bash
sudo groupadd --system onboardpro
sudo useradd \
  --system \
  --gid onboardpro \
  --home-dir /opt/onboardpro \
  --create-home \
  --shell /sbin/nologin \
  --comment "OnBoardPro service account" \
  onboardpro

sudo mkdir -p /opt/onboardpro/app
sudo mkdir -p /etc/onboardpro

sudo chown -R onboardpro:onboardpro /opt/onboardpro
sudo chmod 750 /opt/onboardpro /opt/onboardpro/app

sudo install -o root -g onboardpro -m 640 /dev/null /etc/onboardpro/onboardpro.env
```

## Example Environment File

Set both the public URL variables and keep the DB local:

```bash
sudo tee /etc/onboardpro/onboardpro.env >/dev/null <<'EOF'
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://onboardpro_app:REPLACE_ME@127.0.0.1:5432/onboardpro
SESSION_SECRET=REPLACE_WITH_LONG_RANDOM_SECRET
BASE_URL=https://your-app.example.com
APP_BASE_URL=https://your-app.example.com
TRUSTED_PROXIES=127.0.0.1
AUTH_ENABLE_LDAP=false
DISABLE_DEADLINE_SCANNER=0
DISABLE_EMAIL_JOBS=0
DISABLE_NOTIFICATION_CLEANUP=0
EOF

sudo chown root:onboardpro /etc/onboardpro/onboardpro.env
sudo chmod 640 /etc/onboardpro/onboardpro.env
```

## App Deploy Commands

```bash
sudo mkdir -p /opt/onboardpro/app
sudo chown -R onboardpro:onboardpro /opt/onboardpro

sudo -u onboardpro git clone <your-repo-url> /opt/onboardpro/app
cd /opt/onboardpro/app
sudo -u onboardpro npm install
sudo -u onboardpro npm run build
```

## `systemd` Service

Create `/etc/systemd/system/onboardpro.service`:

```ini
[Unit]
Description=OnBoardPro
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=onboardpro
Group=onboardpro
WorkingDirectory=/opt/onboardpro/app
EnvironmentFile=/etc/onboardpro/onboardpro.env
ExecStart=/usr/bin/node /opt/onboardpro/app/dist/index.js
Restart=always
RestartSec=5
TimeoutStopSec=20

NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
UMask=0027

[Install]
WantedBy=multi-user.target
```

Enable and verify it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now onboardpro
sudo systemctl status onboardpro
journalctl -u onboardpro -f
```

## Local PostgreSQL Setup

Keep the Linux service user separate from the PostgreSQL role:

```bash
sudo -u postgres psql <<'EOF'
CREATE ROLE onboardpro_app LOGIN PASSWORD 'REPLACE_ME';
CREATE DATABASE onboardpro OWNER onboardpro_app;
EOF
```

## Nginx Reverse Proxy

Create `/etc/nginx/conf.d/onboardpro.conf`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name your-app.example.com;

    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name your-app.example.com;

    ssl_certificate     /etc/pki/tls/certs/your-app.crt;
    ssl_certificate_key /etc/pki/tls/private/your-app.key;

    client_max_body_size 10m;

    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;

        proxy_connect_timeout 30s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

Install and enable Nginx:

```bash
sudo dnf install -y nginx
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
```

## RH9 Firewall And SELinux

Open only HTTP and HTTPS publicly:

```bash
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

If Nginx proxies to the Node app on `5000`, RH9 often needs:

```bash
sudo setsebool -P httpd_can_network_connect 1
```

## First-Pass Validation

```bash
curl -I http://your-app.example.com
curl -I https://your-app.example.com
curl -I https://your-app.example.com/health/live
```

## My Post-Meeting Build Plan

1. Install Node, Nginx, PostgreSQL.
2. Create app directory, per-app service user, and env file.
3. Configure PostgreSQL locally.
4. Build and run app on `5000`.
5. Put Nginx in front on `443`.
6. Lock down `5000` and `5432`.
7. Test login, health checks, backups, and service restart behavior.
