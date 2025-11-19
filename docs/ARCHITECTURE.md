# System Architecture

**OnBoardPro** - Hiring Pipeline Management System

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Client (Browser)                        │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           React 18 + TypeScript SPA                  │  │
│  │  • Wouter (routing)                                  │  │
│  │  • TanStack Query (server state)                     │  │
│  │  • Radix UI + TailwindCSS (UI)                      │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ HTTPS (REST API)
                           │ Session Cookies
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                    Express.js Server                         │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Middleware Stack                                    │   │
│  │  • Helmet (security headers)                         │   │
│  │  • Compression                                       │   │
│  │  • Request ID tracking                               │   │
│  │  • Session management                                │   │
│  │  • Rate limiting                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Feature Modules                                     │   │
│  │  • /auth        - Multi-provider authentication      │   │
│  │  • /candidates  - Candidate management               │   │
│  │  • /tasks       - Task workflow                      │   │
│  │  • /templates   - Template engine                    │   │
│  │  • /notifications - Notification system              │   │
│  │  • /email       - Email delivery (SMTP)              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Background Jobs                                     │   │
│  │  • Deadline scanner                                  │   │
│  │  • Email notification processor                      │   │
│  │  • Digest aggregator                                 │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ Drizzle ORM
                           │ SQL Queries
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                    PostgreSQL 16                             │
│  • Session storage                                           │
│  • Application data (20+ tables)                            │
│  • Notification outbox                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Component Architecture

### Client Layer

```
client/src/
├── app/                    # Route-based pages
│   ├── auth/              # Authentication pages
│   ├── (dashboard)/       # Protected dashboard routes
│   │   ├── candidates/    # Candidate management
│   │   ├── tasks/         # Task management
│   │   ├── templates/     # Template editor
│   │   ├── analytics/     # Analytics dashboard
│   │   └── settings/      # User settings
│   └── not-found.tsx      # 404 page
│
├── features/              # Feature-specific code
│   ├── auth/             # Auth hooks & components
│   ├── candidates/       # Candidate components
│   ├── tasks/            # Task components
│   └── templates/        # Template components
│
├── shared/
│   └── components/       # Reusable UI components
│       ├── ui/          # Radix UI components
│       └── layout/      # Layout components
│
└── lib/                  # Utilities & helpers
    ├── queryClient.ts   # TanStack Query setup
    ├── protected-route.tsx
    └── utils.ts
```

**Key Patterns:**
- **Route-based code splitting** for performance
- **TanStack Query** for server state caching
- **Radix UI** for accessible components
- **Mobile-first responsive design**

---

### Server Layer

```
server/
├── index.ts               # Application entry point
├── routes.ts              # Route registration (3,024 LOC)
│
├── config/
│   ├── env.ts            # Environment validation (Zod)
│   └── database.config.ts # PostgreSQL connection
│
├── middleware/           # ✨ NEW - Extracted middleware
│   ├── authorization.ts  # Auth middleware
│   ├── rate-limiter.ts   # Rate limiting
│   └── request-id.ts     # Request tracking
│
├── routes/               # ✨ NEW - Additional routes
│   └── health.ts         # Health check endpoints
│
├── features/             # Feature modules
│   ├── auth/
│   │   └── services/    # Multi-provider auth
│   │       ├── auth.service.ts
│   │       ├── providers.ts
│   │       └── config.ts
│   │
│   ├── candidates/
│   │   └── dto/         # ✨ NEW - Validation DTOs
│   │       └── candidate.dto.ts
│   │
│   ├── tasks/
│   │   ├── dto/         # ✨ NEW - Task DTOs
│   │   │   └── task.dto.ts
│   │   └── services/
│   │       └── advance-stage.service.ts
│   │
│   ├── notifications/
│   │   ├── routes.ts
│   │   └── services/
│   │
│   └── email/
│       ├── outbox.service.ts
│       ├── smtp-settings.service.ts
│       └── templates.ts
│
├── db/
│   ├── connection.ts     # Drizzle setup
│   └── storage.ts        # Data access layer (3,592 LOC)
│
├── jobs/                 # Background workers
│   ├── scan-deadlines.ts
│   └── notification-email.ts
│
├── observability/
│   └── authMetrics.ts    # Authorization metrics
│
└── utils/
    ├── error-handler.ts  # ✨ NEW - Structured errors
    ├── secret.ts         # Secret encryption
    └── app-url.ts        # URL generation
```

---

## Data Architecture

### Database Schema (PostgreSQL 16)

```
Core Entities:
┌──────────────┐
│    users     │──────┬─────────────────────────┐
└──────────────┘      │                         │
       │              │                         │
       │              ↓                         ↓
       │      ┌──────────────┐        ┌──────────────┐
       │      │ user_roles   │        │user_identities│
       │      └──────────────┘        └──────────────┘
       │              │                         │
       │              │   Multi-provider auth   │
       ↓              ↓                         ↓
┌──────────────┐   ┌─────────────────────────────────┐
│ departments  │   │   Auth Providers:               │
│              │   │   • local (bcrypt + scrypt)     │
│  divisions   │   │   • LDAP                        │
└──────────────┘   │   • Google OAuth                │
       │           │   • Azure AD OAuth              │
       │           └─────────────────────────────────┘
       ↓
┌──────────────┐
│ candidates   │───────┐
└──────────────┘       │
       │               │
       │               ↓
       │       ┌──────────────┐
       │       │candidate_tasks│
       │       └──────────────┘
       │               │
       │               ↓
       │       ┌──────────────┐
       │       │hiring_stages │
       │       └──────────────┘
       │
       ├──────────────┐
       │              │
       ↓              ↓
┌──────────────┐   ┌──────────────┐
│ templates    │   │ notifications│
└──────────────┘   └──────────────┘
       │                   │
       ↓                   ↓
┌──────────────┐   ┌──────────────┐
│template_tasks│   │notification  │
│              │   │   _outbox    │
│template_stages│  └──────────────┘
└──────────────┘
```

**Key Design Patterns:**
- ✅ **Normalized schema** with proper foreign keys
- ✅ **Audit fields** (createdAt, updatedAt) on all tables
- ✅ **Soft deletes** (archived, deletedAt)
- ✅ **Outbox pattern** for reliable notifications
- ✅ **Multi-tenancy** via departments/divisions
- ✅ **Template versioning** and locking

---

## Authentication Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Provider Registry                           │
│                                                          │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐       │
│  │   Local    │  │    LDAP    │  │  OAuth 2.0 │       │
│  │ Provider   │  │  Provider  │  │  Providers │       │
│  │            │  │            │  │  • Google  │       │
│  │  bcrypt    │  │  Bind DN   │  │  • Azure   │       │
│  │  scrypt    │  │  Search    │  │            │       │
│  └────────────┘  └────────────┘  └────────────┘       │
└─────────────────────────────────────────────────────────┘
                       │
                       │ AuthService
                       ↓
┌─────────────────────────────────────────────────────────┐
│              User Identity Management                    │
│                                                          │
│  • Link multiple providers to one user                  │
│  • Automatic user creation on first login               │
│  • Role-based access control (RBAC)                     │
│  • Authorization context with scopes                    │
└─────────────────────────────────────────────────────────┘
                       │
                       │ Passport.js
                       ↓
┌─────────────────────────────────────────────────────────┐
│              Session Management                          │
│                                                          │
│  • PostgreSQL session store                             │
│  • 7-day cookie expiration                              │
│  • Secure, httpOnly, sameSite=strict                    │
│  • Domain-specific cookies                              │
└─────────────────────────────────────────────────────────┘
```

**Security Features:**
- ✅ **CSRF protection** (sameSite cookies)
- ✅ **XSS protection** (Helmet security headers)
- ✅ **Rate limiting** (IP-based)
- ✅ **Password hashing** (bcrypt + scrypt)
- ✅ **Session encryption** (PostgreSQL store)

---

## Notification Architecture

```
                  Event Triggered
                        │
                        ↓
    ┌────────────────────────────────────┐
    │   createNotifications()            │
    │   • Extract mentions               │
    │   • Determine recipients           │
    │   • Check user preferences         │
    └────────────────────────────────────┘
                        │
                        ↓
    ┌────────────────────────────────────┐
    │   notifications table              │
    │   • Store in-app notification      │
    │   • Mark channels: ['in_app']      │
    └────────────────────────────────────┘
                        │
          ┌─────────────┴──────────────┐
          │                            │
   notifyEmail?                 notifyInApp?
          │                            │
          ↓                            ↓
    ┌─────────────┐            ┌─────────────┐
    │notification_│            │  User sees  │
    │   outbox    │            │  in app     │
    │             │            └─────────────┘
    │ • immediate │
    │ • digest    │
    └─────────────┘
          │
          ↓
    Background Job
          │
    ┌─────┴──────┐
    │            │
immediate    digest (daily/weekly)
    │            │
    ↓            ↓
 Send email   Aggregate & send
```

**Outbox Pattern Benefits:**
- ✅ **Reliable delivery** with retries
- ✅ **Digest aggregation** (daily/weekly)
- ✅ **Quiet hours** support
- ✅ **Idempotent processing**

---

## Middleware Stack

```
Request Flow:
1. Helmet         → Security headers (CSP, XSS protection)
2. Compression    → Gzip/Deflate response compression
3. Request ID     → Generate UUID for tracing
4. Body Parser    → Parse JSON/URL-encoded bodies
5. Logging        → Log request with ID
6. Session        → Load user session
7. Rate Limiter   → Check request rate
8. Authorization  → Verify permissions
9. Route Handler  → Execute business logic
10. Error Handler → Catch and format errors
11. Response      → Send to client
```

**Headers Added:**
```
X-Request-ID: uuid
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 115
X-RateLimit-Reset: timestamp
Content-Security-Policy: ...
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
ETag: "hash"
```

---

## Deployment Architecture

### Development
```
┌─────────────────────────────────────┐
│  Docker Compose                     │
│  • PostgreSQL 16                    │
│  • Port 5432                        │
└─────────────────────────────────────┘
              │
              ↓
┌─────────────────────────────────────┐
│  Vite Dev Server (HMR)              │
│  • Port 5000 (default)              │
│  • Hot module replacement           │
│  • API proxy                        │
└─────────────────────────────────────┘
```

### Production
```
┌─────────────────────────────────────┐
│  Load Balancer / Reverse Proxy      │
│  • SSL termination                  │
│  • Rate limiting                    │
└─────────────────────────────────────┘
              │
              ↓
┌─────────────────────────────────────┐
│  Node.js Cluster (PM2/K8s)          │
│  • Multiple instances               │
│  • Health checks (/health/ready)    │
│  • Graceful shutdown                │
└─────────────────────────────────────┘
              │
              ↓
┌─────────────────────────────────────┐
│  Managed PostgreSQL                 │
│  • Connection pooling               │
│  • Replication                      │
│  • Backups                          │
└─────────────────────────────────────┘
```

**Kubernetes Readiness:**
- ✅ Health check endpoints
- ✅ Graceful shutdown
- ✅ 12-factor app compliance
- ✅ Environment-based configuration

---

## Technology Stack

### Frontend
- **React 18** - UI library
- **TypeScript** - Type safety
- **Wouter** - Client-side routing (5KB)
- **TanStack Query** - Server state management
- **Radix UI** - Accessible component primitives
- **TailwindCSS** - Utility-first styling
- **Vite** - Build tool & dev server

### Backend
- **Node.js** - Runtime
- **Express.js** - Web framework
- **TypeScript** - Type safety
- **Drizzle ORM** - Type-safe database queries
- **Passport.js** - Authentication middleware
- **Zod** - Schema validation
- **Helmet** - Security headers
- **Compression** - Response compression

### Database
- **PostgreSQL 16** - Primary database
- **Drizzle ORM** - Query builder
- **pg** - PostgreSQL client
- **connect-pg-simple** - Session store

### Infrastructure
- **Docker** - Local development
- **PM2 / Kubernetes** - Process management
- **GitHub Actions** - CI/CD (potential)

---

## Scalability Considerations

### Current Limitations
⚠️ **Single-process background jobs** - Can't horizontally scale
⚠️ **In-memory rate limiting** - Lost on restart
⚠️ **No caching layer** - Every request hits database

### Recommended Improvements
1. **Extract background jobs** to separate worker processes
2. **Add Redis** for distributed rate limiting and caching
3. **Implement message queue** (Bull/BullMQ) for job processing
4. **Add database read replicas** for query scaling
5. **Implement CDN** for static assets

---

## Monitoring & Observability

### Current Capabilities
✅ Health check endpoints (`/health`, `/health/ready`, `/health/live`)
✅ Request ID tracking across all logs
✅ Authorization failure metrics
✅ Structured error responses
✅ Database query logging (development)

### Recommended Additions
- [ ] Prometheus metrics endpoint
- [ ] Distributed tracing (OpenTelemetry)
- [ ] APM integration (DataDog, New Relic)
- [ ] Log aggregation (ELK stack, CloudWatch)
- [ ] Error tracking (Sentry)

---

## Security Architecture

### Defense in Depth

```
Layer 1: Network
  • Firewall rules
  • SSL/TLS encryption
  • DDoS protection

Layer 2: Application
  • Helmet security headers
  • Rate limiting
  • CSRF protection (sameSite cookies)
  • Input validation (Zod schemas)

Layer 3: Authentication
  • Multi-provider support
  • Password hashing (bcrypt/scrypt)
  • Session encryption
  • Account lockout (future)

Layer 4: Authorization
  • Role-based access control (RBAC)
  • Resource-level permissions
  • Authorization context
  • Audit logging

Layer 5: Data
  • Encrypted secrets (SMTP passwords)
  • SQL injection prevention (parameterized queries)
  • XSS prevention (React escaping)
  • Soft deletes (data retention)
```

---

## Performance Characteristics

### Response Times (Typical)
- Health check: `< 20ms`
- Database query: `< 50ms`
- API endpoint: `< 100ms`
- Page load: `< 2s` (initial)
- Page navigation: `< 500ms` (client-side)

### Throughput
- **Default endpoints:** 120 req/min per IP
- **Sensitive endpoints:** 60 req/min per IP
- **Database connections:** Pooled (default: 10)

### Optimization Features
✅ Response compression (60-80% reduction)
✅ ETag caching
✅ TanStack Query caching (client-side)
✅ Code splitting (route-based)
✅ Connection pooling

---

## Related Documentation

- **Architecture Review:** `/docs/ARCHITECTURE_REVIEW.md`
- **API Examples:** `/docs/API_EXAMPLES.md`
- **Quick Wins:** `/docs/QUICK_WINS.md`
- **Contributing:** `/CONTRIBUTING.md`
- **Environment Setup:** `/.env.example`

---

**Last Updated:** 2025-11-19
**Version:** 1.0.0
**Architecture Health Score:** 7.5/10
