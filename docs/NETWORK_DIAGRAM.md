# OnBoardPro Production Network Diagram

```mermaid
graph TB
    subgraph Internet["Internet"]
        Browser["👤 Browser Client<br/>(React 18 SPA)"]
        GoogleOAuth["Google OAuth<br/>(accounts.google.com)"]
        AzureAD["Azure AD OAuth<br/>(login.microsoftonline.com)"]
    end

    subgraph DMZ["DMZ / Reverse Proxy Tier"]
        RP["Reverse Proxy<br/>(Nginx / HAProxy)<br/>:443 TLS"]
    end

    subgraph AppTier["Application Tier"]
        Express["Express.js Server<br/>Node.js 22<br/>:5000"]
        
        subgraph Middleware["Middleware Stack"]
            Helmet["Helmet<br/>(Security Headers)"]
            Session["Session Mgmt<br/>(express-session)"]
            CSRF["CSRF Protection"]
            RateLimit["Rate Limiting"]
            Compression["Compression"]
        end

        subgraph Features["Feature Modules"]
            Auth["Auth Module<br/>(Local + LDAP + OAuth)"]
            API["REST API<br/>(/api/*)"]
            Swagger["Swagger UI<br/>(/api/docs)"]
        end

        subgraph Jobs["Background Jobs"]
            Deadline["Deadline Scanner"]
            EmailJob["Email Notification<br/>Processor"]
            Cleanup["Notification Cleanup"]
        end
    end

    subgraph DataTier["Data Tier"]
        PG["PostgreSQL 17.6<br/>:5432<br/>(20+ tables, sessions,<br/>notification outbox)"]
    end

    subgraph ExternalServices["External Services"]
        LDAP["LDAP / AD Server<br/>(ldaps://389|636)"]
        SMTP["SMTP Server<br/>(Email Relay)"]
    end

    %% Connections
    Browser -- "HTTPS :443<br/>REST + Session Cookies" --> RP
    RP -- "HTTP :5000<br/>(proxy_pass)" --> Express
    
    Express --> Middleware
    Express --> Features
    Express --> Jobs

    Auth -- "OAuth2 Redirect" --> GoogleOAuth
    Auth -- "OAuth2 Redirect" --> AzureAD
    Auth -- "LDAP Bind/Search" --> LDAP

    EmailJob -- "SMTP<br/>(nodemailer)" --> SMTP
    
    Express -- "Drizzle ORM<br/>SQL / pg" --> PG
    Session -- "connect-pg-simple" --> PG

    %% Styling
    classDef internet fill:#e3f2fd,stroke:#1565c0,color:#000
    classDef dmz fill:#fff3e0,stroke:#e65100,color:#000
    classDef app fill:#e8f5e9,stroke:#2e7d32,color:#000
    classDef data fill:#f3e5f5,stroke:#6a1b9a,color:#000
    classDef external fill:#fce4ec,stroke:#b71c1c,color:#000

    class Browser,GoogleOAuth,AzureAD internet
    class RP dmz
    class Express,Helmet,Session,CSRF,RateLimit,Compression,Auth,API,Swagger,Deadline,EmailJob,Cleanup app
    class PG data
    class LDAP,SMTP external
```

## Network Tiers

| Tier | Component | Port | Protocol |
|------|-----------|------|----------|
| **Internet** | Browser Client (React 18 SPA) | — | HTTPS |
| **Internet** | Google OAuth | — | HTTPS (OAuth2) |
| **Internet** | Azure AD OAuth | — | HTTPS (OAuth2) |
| **DMZ** | Reverse Proxy (Nginx/HAProxy) | 443 | TLS termination |
| **Application** | Express.js (Node.js 22) | 5000 | HTTP |
| **Data** | PostgreSQL 17.6 | 5432 | TCP (SQL) |
| **External** | LDAP / Active Directory | 389/636 | LDAP/LDAPS |
| **External** | SMTP Relay | 25/465/587 | SMTP/SMTPS |

## Data Flows

1. **Client → App**: Browsers connect via HTTPS to the reverse proxy, which terminates TLS and forwards to Express on port 5000. Session cookies are used for authentication.
2. **Auth → Identity Providers**: The auth module handles OAuth2 redirects to Google and Azure AD, and LDAP bind/search operations to the directory server.
3. **App → Database**: All persistence goes through Drizzle ORM to PostgreSQL, including session storage via `connect-pg-simple`.
4. **Jobs → SMTP**: The email notification processor sends outbound emails via nodemailer through the configured SMTP relay.

## Middleware Stack

- **Helmet** — Security headers (CSP, HSTS, X-Frame-Options, etc.)
- **Compression** — gzip/brotli response compression
- **Session Management** — `express-session` with PostgreSQL-backed store
- **CSRF Protection** — Token-based CSRF mitigation
- **Rate Limiting** — Per-endpoint rate limit counters (stored in PostgreSQL)
- **Request ID** — Unique request tracking for logging and debugging
