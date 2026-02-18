# System Architecture

**OnBoardPro** - Hiring Pipeline Management System

---

## High-Level Architecture

```
┌────────────────────────────────────────────────────────────┐
│                      Client (Browser)                      │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           React 18 + TypeScript SPA                  │  │
│  │  • Wouter (routing)                                  │  │
│  │  • TanStack Query (server state)                     │  │
│  │  • Radix UI + TailwindCSS (UI)                       │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
                           │
                           │ HTTPS (REST API)
                           │ Session Cookies
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                    Express.js Server                        │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Middleware Stack                                    │   │
│  │  • Helmet (security headers)                         │   │
│  │  • Compression                                       │   │
│  │  • Request ID tracking                               │   │
│  │  • Session management                                │   │
│  │  • Rate limiting                                     │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Feature Modules                                     │   │
│  │  • /auth        - Multi-provider authentication      │   │
│  │  • /candidates  - Candidate management               │   │
│  │  • /tasks       - Task workflow                      │   │
│  │  • /templates   - Template engine                    │   │
│  │  • /notifications - Notification system              │   │
│  │  • /email       - Email delivery (SMTP)              │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Background Jobs                                     │   │
│  │  • Deadline scanner                                  │   │
│  │  • Email notification processor                      │   │
│  │  • Notification cleanup                              │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ Drizzle ORM
                           │ SQL Queries
                           ↓
┌──────────────────────────────────────────────────────────────┐
│                    PostgreSQL 16                             │
│  • Session storage                                           │
│  • Application data (20+ tables)                             │
│  • Notification outbox                                       │
└──────────────────────────────────────────────────────────────┘
```

---

## API Documentation
- Swagger UI: `/api/docs`
- Canonical OpenAPI JSON: `/api/docs.json` (source `server/docs/openapi-spec.ts`; `/api/docs/spec.json` is kept for backward compatibility).

---

## Data & Seeding
- Database: PostgreSQL (see `docker-compose.yml` for local dev).
- Schema: Drizzle definitions in `shared/schema.ts` and `shared/schemas/*.ts`.
- Seeds: Sample data in `initdb/phase5_sample_data.sql` applied by the Postgres container on first start.

---

## Component Architecture

### Client Layer

```
client/src/
├── app/                         # Route-based pages
│   ├── auth/                   # Authentication pages
│   │   └── page.tsx           # Login page
│   ├── (dashboard)/            # Protected dashboard routes
│   │   ├── page.tsx           # Dashboard home with metrics
│   │   ├── candidates/        # Candidate management pages
│   │   │   ├── page.tsx      # Candidate list
│   │   │   └── [id]/         # Candidate detail & edit
│   │   ├── tasks/            # Task management pages
│   │   │   ├── page.tsx      # Task definitions list
│   │   │   └── mine/         # My assigned tasks
│   │   ├── templates/        # Template management pages
│   │   │   ├── page.tsx      # Template list
│   │   │   └── [id]/         # Template editor
│   │   ├── analytics/        # Analytics dashboard
│   │   ├── notifications/    # Notification center
│   │   └── settings/         # User & system settings
│   └── not-found.tsx          # 404 page
│
├── features/                   # Feature-specific components & logic
│   ├── auth/                  # Authentication
│   │   ├── hooks/            # useAuth() provider
│   │   └── components/       # Login/register forms
│   ├── candidates/           # Candidate features
│   │   ├── components/       # Candidate forms, cards, dialogs
│   │   └── hooks/           # Candidate queries & mutations
│   ├── templates/           # Template features
│   │   ├── components/      # Template editors, stage/task forms
│   │   └── hooks/          # Template queries
│   ├── tasks/              # Task features
│   │   ├── components/     # Task cards, status badges
│   │   └── hooks/         # useMyTasks(), task mutations
│   ├── comments/          # Comment system
│   │   └── components/    # Comment list, form, mentions
│   ├── notifications/     # Notifications
│   │   ├── components/    # Notification bell, list, items
│   │   └── hooks/        # Notification queries
│   └── settings/         # Settings features
│       └── components/   # Preference forms, SMTP config
│
├── shared/
│   ├── components/            # Reusable UI components
│   │   ├── ui/               # shadcn/ui Radix components
│   │   │   ├── button.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── form.tsx
│   │   │   ├── select.tsx
│   │   │   ├── table.tsx
│   │   │   └── [40+ components]
│   │   ├── forms/            # Form components
│   │   ├── inputs/           # Input components
│   │   ├── layout/           # Layout components
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   └── MobileSidebar.tsx
│   │   └── settings/         # Settings-specific components
│   └── hooks/                # Shared hooks
│       ├── use-toast.tsx
│       └── use-mobile.tsx
│
├── lib/                       # Utilities & helpers
│   ├── queryClient.ts        # TanStack Query setup
│   ├── protected-route.tsx   # Route authentication wrapper
│   ├── utils.ts              # Utility functions (cn, formatters)
│   ├── search.ts             # Search/filter utilities
│   ├── task-status.ts        # Task status helpers
│   └── export-utils.ts       # CSV/PDF export helpers
│
├── App.tsx                    # Main app with router & providers
├── main.tsx                   # React entry point
└── index.css                  # Global styles & Tailwind
```

**Key Patterns:**
- **Route-based code splitting** with React lazy loading for performance
- **TanStack Query** for server state caching with invalidation strategies
- **Radix UI** for accessible component primitives (shadcn/ui patterns)
- **Mobile-first responsive design** with Sheet component for mobile sidebar
- **Feature modules** with co-located components and hooks
- **Shared UI library** with 40+ reusable components
- **Dark/light theme support** via ThemeProvider
- **Form validation** with React Hook Form + Zod schemas

---

### Server Layer

```
server/
├── index.ts                        # App bootstrap + middleware + job startup
├── routes.ts                       # Central route and CSRF/rate-limit wiring
├── config/
│   ├── env.ts                      # Environment validation (Zod)
│   └── database.config.ts          # DB initialization
├── middleware/
│   ├── authorization.ts
│   ├── csrf.ts
│   ├── rate-limiter.ts
│   ├── request-id.ts
│   ├── session-timeout.ts
│   └── validation.ts
├── routes/
│   ├── auth.routes.ts
│   ├── candidates.routes.ts
│   ├── templates.routes.ts
│   ├── tasks.routes.ts
│   ├── users.routes.ts
│   ├── notifications.routes.ts
│   ├── search.routes.ts
│   ├── organizations.routes.ts
│   ├── reference-data.routes.ts
│   ├── settings.routes.ts
│   ├── audit.routes.ts
│   ├── docs.ts
│   └── health.ts
├── services/
│   ├── service-factory.ts          # Service/repository dependency wiring
│   ├── auth/auth-provider.service.ts
│   ├── authorization/              # Policies + authorization service
│   ├── candidates/                 # Candidate + stage advancement services
│   ├── templates/                  # Template CRUD/expansion/estimation/prereqs
│   ├── tasks/                      # Task and due-date services
│   ├── users/                      # User + invitation services
│   ├── organization/organization.service.ts
│   ├── reference/reference-data.service.ts
│   ├── dashboard/dashboard.service.ts
│   ├── settings/system-settings.service.ts
│   ├── shared/                     # Notification, comment, audit logger, search
│   └── audit/audit.service.ts
├── repositories/
│   ├── base/
│   ├── candidates/
│   ├── templates/
│   ├── users/
│   ├── reference/
│   ├── organizational/
│   ├── CommentRepository.ts
│   ├── NotificationRepository.ts
│   └── SearchRepository.ts
├── features/
│   ├── auth/services/
│   ├── candidates/dto/
│   ├── tasks/{dto,services}/
│   ├── notifications/{routes.ts,services/}
│   └── email/                      # outbox, smtp settings, email templates
├── events/
│   ├── EventBus.ts
│   ├── event-types.ts
│   ├── event-factory.ts
│   ├── handlers/notification-handler.ts
│   └── middleware/logging-middleware.ts
├── jobs/
│   ├── scan-deadlines.ts
│   ├── notification-email.ts
│   └── notification-cleanup.ts
├── tests/                          # auth/routes/repositories/services/middleware/events/utils
├── observability/authMetrics.ts
├── utils/                          # date, auth, ip, logger, passwords, app-url, etc.
└── types/express.d.ts
```

**Key Architecture Patterns:**

**1. Service Factory Pattern:**
- Central `ServiceFactory` manages all service instances
- Singleton repositories shared across services
- Dependency injection for testability
- `MockServiceFactory` for test isolation

**2. Layered Architecture:**
- **Routes** → API endpoints with request/response handling
- **Services** → Business logic and orchestration
- **Repositories** → Data access and queries
- **Database** → PostgreSQL via Drizzle ORM

**3. Authorization Engine:**
- Policy-based access control (CandidatePolicy, TaskPolicy)
- Authorization context with roles and scopes
- Resource-level permission checks
- Department/division/manager scoping

**4. Event-Driven Architecture:**
- Domain events via EventBus
- Asynchronous event handlers
- Notification creation from events
- Middleware for logging and metrics

**5. Repository Pattern:**
- BaseRepository with common CRUD operations
- Type-safe queries via Drizzle ORM
- Pagination and filtering support
- Transaction management

---

## Data Architecture

### Database Schema (PostgreSQL 16)

**Complete Table Listing (30+ tables):**

**Authentication & Users:**
```
users                     # Core user accounts with auth provider
├── user_identities       # Multi-provider identity mapping
├── user_roles           # Additional app-level roles
├── user_preferences     # Notification & display preferences
├── auth_providers       # Enabled authentication methods config
└── sessions             # Express session storage (connect-pg-simple)
```

**Organizational Structure:**
```
departments              # Department entities
└── divisions            # Divisions within departments
```

**Candidates & Hiring:**
```
candidates               # Core candidate records
├── candidate_types      # Classification (faculty, staff, etc.)
├── faculty_ranks        # Faculty rank classifications
├── candidate_followers  # Users following candidates
├── candidate_stage_history  # Audit trail of stage transitions
└── candidate_template_stages  # Snapshot of stages when template applied
```

**Hiring Pipeline:**
```
hiring_stages            # Pipeline stages (Application, Offer, etc.)
                         # with phase (pre_hire, post_hire)
```

**Tasks & Workflow:**
```
task_definitions         # Reusable task templates
├── candidate_tasks      # Tasks specific to candidates
├── candidateTaskAssignments  # Assignment tracking
├── task_categories      # Task categorization
└── task_priorities      # Priority levels (high, medium, low)
```

**Templates:**
```
templates                # Hiring workflow templates
├── template_stages      # Stages in a template
└── template_tasks       # Tasks within template stages
                         # with due date rules
```

**Collaboration & Communication:**
```
comments                 # Comments on candidates/tasks
                         # with visibility (internal/external)
├── notifications        # In-app notifications
├── notification_keys    # Deduplication keys
├── notification_outbox  # Email outbox (SMTP delivery)
└── audit_log            # Comprehensive audit trail of all actions
                         # with CRUD tracking (resourceType, action)
```

**Settings & Configuration:**
```
smtp_settings            # SMTP configuration (encrypted secrets)
└── system_settings      # System-level configuration
```

**Entity Relationship Diagram:**
```
┌──────────────┐
│    users     │──────┬──────────────────────────┐
└──────────────┘      │                          │
       │              │                          │
       │              ↓                          ↓
       │      ┌──────────────┐         ┌──────────────┐
       │      │ user_roles   │         │user_identities│
       │      └──────────────┘         └──────────────┘
       │                                         │
       │      ┌──────────────┐                   │
       ├─────►│user_preferences│                 │
       │      └──────────────┘                   │
       │                                         │
       │      Multi-provider Authentication      │
       │      ┌─────────────────────────────┐    │
       │      │  auth_providers             │  ◄─┘
       │      │  • local (bcrypt + scrypt)  │
       │      │  • LDAP                     │
       │      │  • Google OAuth             │
       │      │  • Azure AD OAuth           │
       │      └─────────────────────────────┘
       │
       ├──────────────┐
       │              │
       ↓              ↓
┌──────────────┐  ┌──────────────┐
│ departments  │  │  divisions   │
└──────────────┘  └──────────────┘
       │              │
       │              │
       ↓              ↓
┌─────────────────────────────────┐
│        candidates               │
│  • status tracking              │
│  • manager/owner relationships  │
│  • template application history │
└─────────────────────────────────┘
       │
       ├──────────┬──────────┬──────────┬──────────┐
       │          │          │          │          │
       ↓          ↓          ↓          ↓          ↓
┌───────────┐ ┌──────┐ ┌────────┐ ┌────────┐ ┌─────────┐
│candidate_ │ │hiring│ │comments│ │activity│ │candidate│
│  tasks    │ │stages│ │        │ │  _log  │ │followers│
└───────────┘ └──────┘ └────────┘ └────────┘ └─────────┘
       │
       ↓
┌───────────────────┐
│task_definitions   │
├──task_categories  │
└──task_priorities  │
└───────────────────┘
       ↑
       │
┌─────────────────────┐
│  templates          │
│    ├─template_stages│
│    └─template_tasks │
└─────────────────────┘
       │
       ↓
┌──────────────────────┐
│ Notification System  │
├──notifications       │
├──notification_keys   │
└──notification_outbox │
└──────────────────────┘
```

**Key Design Patterns:**
- ✅ **Normalized schema** with proper foreign keys and indexes
- ✅ **Audit fields** (createdAt, updatedAt, createdBy, updatedBy) on all tables
- ✅ **Comprehensive audit logging** with CRUD tracking (resourceType, resourceId, action)
- ✅ **Soft deletes** (deletedAt, archived) for data retention
- ✅ **Outbox pattern** for reliable email notifications
- ✅ **Multi-tenancy** via departments and divisions
- ✅ **Template versioning** with lock-in mechanism
- ✅ **Multi-provider identity** mapping across auth providers
- ✅ **UUID primary keys** for distributed systems
- ✅ **Notification deduplication** via notification_keys
- ✅ **Encrypted secrets** for sensitive configuration (SMTP passwords)

---

## Authentication Architecture

```
┌───────────────────────────────────────────────────────┐
│              Provider Registry                        │
│                                                       │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐       │
│  │   Local    │  │    LDAP    │  │  OAuth 2.0 │       │
│  │ Provider   │  │  Provider  │  │  Providers │       │
│  │            │  │            │  │  • Google  │       │
│  │  bcrypt    │  │  Bind DN   │  │  • Azure   │       │
│  │  scrypt    │  │  Search    │  │            │       │
│  └────────────┘  └────────────┘  └────────────┘       │
└───────────────────────────────────────────────────────┘
                       │
                       │ AuthService
                       ↓
┌─────────────────────────────────────────────────────────┐
│              User Identity Management                   │
│                                                         │
│  • Link multiple providers to one user                  │
│  • Automatic user creation on first login               │
│  • Role-based access control (RBAC)                     │
│  • Authorization context with scopes                    │
└─────────────────────────────────────────────────────────┘
                       │
                       │ Passport.js
                       ↓
┌─────────────────────────────────────────────────────────┐
│              Session Management                         │
│                                                         │
│  • PostgreSQL session store                             │
│  • 10-hour cookie expiration (rolling)                  │
│  • Idle timeout: 2 hours (configurable)                 │
│  • Absolute timeout: 24 hours (configurable)            │
│  • Secure, httpOnly, sameSite=strict                    │
│  • Domain-specific cookies                              │
└─────────────────────────────────────────────────────────┘
```

**Security Features:**
- ✅ **CSRF protection** (global `/api` middleware + token endpoint with explicit login/bootstrap exclusions)
- ✅ **XSS protection** (Helmet security headers)
- ✅ **Rate limiting** (DB-backed IP-based counters with trusted proxy support)
- ✅ **Password hashing** (bcrypt + scrypt via `server/utils/passwords.ts`)
- ✅ **Constant-time password comparison** (prevents timing attacks)
- ✅ **Session encryption** (PostgreSQL store)
- ✅ **Session timeouts** (idle + absolute via `server/middleware/session-timeout.ts`)

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

## Audit Logging Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Audit Logging System                   │
│                                                         │
│  ┌────────────────────────────────────┐                 │
│  │   writeAuditLog()                  │                 │
│  │   • Resource type tracking         │                 │
│  │   • Action tracking (CRUD)         │                 │
│  │   • Actor identification           │                 │
│  │   • Request ID correlation         │                 │
│  └────────────────────────────────────┘                 │
│                    │                                    │
│                    ↓                                    │
│  ┌────────────────────────────────────┐                 │
│  │   audit_log table                  │                 │
│  │   • occurredAt (timestamp)         │                 │
│  │   • actorId (who)                  │                 │
│  │   • resourceType (what)            │                 │
│  │   • resourceId (which)             │                 │
│  │   • action (create/update/delete)  │                 │
│  │   • eventType (crud/authorization) │                 │
│  │   • details (JSON metadata)        │                 │
│  │   • candidateId, taskId (context)  │                 │
│  └────────────────────────────────────┘                 │
│                    │                                    │
│                    ↓                                    │
│  ┌────────────────────────────────────┐                 │
│  │   Indexed Queries                  │                 │
│  │   • By resource type + ID          │                 │
│  │   • By actor                       │                 │
│  │   • By time range (occurred_at)    │                 │
│  │   • Cursor-based pagination        │                 │
│  └────────────────────────────────────┘                 │
└─────────────────────────────────────────────────────────┘
```

**Audit Logging Features:**
- ✅ **Comprehensive tracking** of all CRUD operations across the system
- ✅ **Resource-level granularity** with resourceType, resourceId, and action
- ✅ **Actor tracking** for user accountability
- ✅ **Authorization failures** logged with access_denied action
- ✅ **Request correlation** via requestId in details JSON
- ✅ **Efficient querying** with indexed columns and cursor pagination
- ✅ **Non-blocking** audit writes (errors don't block business logic)
- ✅ **Flexible metadata** storage via JSON details column

**Audited Resource Types:**
- `candidate` - Candidate CRUD operations
- `candidate_task` - Task operations on candidates
- `task` - Task definition operations
- `template` - Template management
- `template_task` - Template task operations
- `comment` - Comment activity
- `user` - User management
- `department` / `division` - Organizational changes
- `invitation` - User invitation tracking
- `settings` - System configuration changes

**Audit Actions:**
- `create` - Resource creation
- `update` - Resource modification
- `delete` - Resource deletion
- `archive` / `restore` - Soft deletion lifecycle
- `assign` - Task/ownership assignment
- `status_change` - Status transitions
- `access_denied` - Authorization failures

**API Endpoints:**
- **GET** `/api/admin/audit` - Query audit logs (admin only)
  - Query params: `resourceType`, `action`, `actorId`, `before` (cursor), `limit`
  - Returns paginated results with `nextCursor` for pagination

---

## Event-Driven Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     EventBus                            │
│  • Publish-Subscribe Pattern                            │
│  • Type-safe event types                                │
│  • Async event processing                               │
│  • Middleware support                                   │
└─────────────────────────────────────────────────────────┘
                       │
                       │ Domain Events
                       │
         ┌─────────────┼─────────────┬──────────────┐
         │             │             │              │
         ↓             ↓             ↓              ↓
┌────────────────┐ ┌───────────┐ ┌──────────────┐ ┌────────────┐
│candidateCreated│ │taskCreated│ │commentCreated│ │stageChanged│
└────────────────┘ └───────────┘ └──────────────┘ └────────────┘
         │             │             │              │
         └─────────────┼─────────────┴──────────────┘
                       │
                       ↓
         ┌─────────────────────────────┐
         │    Event Handlers           │
         ├─────────────────────────────┤
         │ • Notification Handler      │
         │   - Creates notifications   │
         │   - Extracts @mentions      │
         │   - Checks preferences      │
         │                             │
         │ • Activity Log Handler      │
         │   - Records audit trail     │
         │                             │
         │ • Email Handler             │
         │   - Populates outbox        │
         └─────────────────────────────┘
                       │
                       ↓
         ┌─────────────────────────────┐
         │   Event Middleware          │
         ├─────────────────────────────┤
         │ • Logging Middleware        │
         │ • Metrics Middleware        │
         │ • Error Handling            │
         └─────────────────────────────┘
```

**Event Types:**
- `candidateCreated` - New candidate added
- `candidateStatusChanged` - Status updated
- `candidateStageChanged` - Stage progression
- `templateApplied` - Template applied to candidate
- `taskCreated` - New task created
- `taskAssigned` - Task assigned to user
- `taskCompleted` - Task marked complete
- `taskStatusChanged` - Task status updated
- `commentCreated` - Comment posted
- `ownerChanged` - Candidate owner changed
- `deadlineApproaching` - Task deadline near

**Event Flow:**
1. **Action occurs** (e.g., candidate created, task completed)
2. **Service emits event** via EventBus.emit()
3. **Middleware processes** event (logging, metrics)
4. **Handlers execute** asynchronously and concurrently
5. **Side effects occur** (notifications created, emails queued, activity logged)

**Benefits:**
- ✅ **Decoupled architecture** - Services don't directly depend on side effects
- ✅ **Extensibility** - Add new handlers without modifying core logic
- ✅ **Async processing** - Non-blocking event handling
- ✅ **Type safety** - TypeScript event type definitions
- ✅ **Testability** - Easy to mock and test event handlers

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
7. Rate Limiter   → Check request rate (default `/api`, sensitive for selected auth routes)
8. CSRF Guard     → Validate CSRF token for state-changing requests
9. Authorization  → Verify permissions
10. Route Handler → Execute business logic
11. Error Handler → Catch and format errors
12. Response      → Send to client
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
- **React 18.3.1** - UI library with hooks and concurrent features
- **TypeScript 5.6.3** - Type safety with strict mode
- **Wouter 3.3.5** - Client-side routing (5KB lightweight router)
- **TanStack Query 5.60.5** - Server state management and caching
- **Radix UI** - Accessible component primitives (Dialog, DropdownMenu, Select, etc.)
- **TailwindCSS 3.4.17** - Utility-first styling with custom design system
- **Vite 7.1.6** - Build tool & dev server with HMR
- **React Hook Form 7.55.0** - Form state management
- **Zod 3.25.1** - Runtime type validation
- **Additional UI:** TipTap (rich text), Sonner (toasts), dnd-kit (drag & drop), react-day-picker (dates), cmdk (command palette)

### Backend
- **Node.js 22.21.0** - Runtime environment
- **Express.js 4.21.2** - Web framework with middleware stack
- **TypeScript 5.6.3** - Type safety throughout backend
- **Drizzle ORM 0.44.7** - Type-safe database queries with TypeScript inference
- **Passport.js 0.7.0** - Authentication middleware with multiple strategies
- **Zod 3.25.1** - Schema validation (shared with frontend)
- **Helmet 8.1.0** - Security headers (CSP, XSS protection)
- **bcrypt 6.0.0** - Password hashing
- **Nodemailer 7.0.9** - Email delivery (SMTP)
- **ldapjs 3.0.7** - LDAP authentication (optional)
- **express-session** - Session management with PostgreSQL store

### Database
- **PostgreSQL 16+** - Primary database (Docker local, Neon serverless production)
- **Drizzle ORM 0.44.7** - Query builder with migrations via Drizzle Kit
- **pg (node-postgres)** - PostgreSQL client with connection pooling
- **connect-pg-simple** - Session store implementation
- **@neondatabase/serverless** - Production database driver

### Testing
- **Vitest 4.0.10** - Frontend unit testing with happy-dom
- **Node Test Runner** - Backend testing via tsx
- **@testing-library/react** - Component testing utilities
- **@testing-library/jest-dom** - DOM matchers
- **Supertest** - HTTP integration testing
- **Custom Test Infrastructure:** MockServiceFactory, testAgent, fixtures

### Infrastructure & DevOps
- **Docker Compose** - Local PostgreSQL development environment
- **tsx** - TypeScript execution for development
- **esbuild** - Production bundling (via Vite)
- **PM2 / Kubernetes** - Process management (production-ready)
- **GitHub Actions** - CI/CD ready

---

## Scalability Considerations

### Current Limitations
⚠️ **Single-process background jobs** - Can't horizontally scale
⚠️ **DB-backed rate limiting overhead** - Counter writes add DB load at very high request volume
⚠️ **No caching layer** - Every request hits database

### Recommended Improvements
1. **Extract background jobs** to separate worker processes
2. **Add Redis** as optional backend for high-throughput rate-limit counters and caching
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

### Possible Additions
- [ ] Prometheus metrics endpoint
- [ ] Distributed tracing (OpenTelemetry)
- [ ] APM integration (DataDog, New Relic)
- [ ] Log aggregation (ELK stack, CloudWatch)
- [ ] Error tracking (Sentry)

---

## Testing Architecture

### Test Infrastructure

```
┌─────────────────────────────────────────────────────────┐
│                 Frontend Testing (Vitest)               │
├─────────────────────────────────────────────────────────┤
│  Environment: happy-dom                                 │
│  Framework: Vitest 4.0.10                               │
│  Utilities: @testing-library/react, jest-dom            │
│                                                         │
│  Test Types:                                            │
│  • Component tests (UI components)                      │
│  • Hook tests (custom React hooks)                      │
│  • Utility tests (helper functions)                     │
│  • Integration tests (page-level)                       │
│                                                         │
│  Location: client/tests/ and scattered in /src          │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│           Backend Testing (Node Test Runner)            │
├─────────────────────────────────────────────────────────┤
│  Runtime: tsx with Node.js built-in test runner         │
│  HTTP Testing: Supertest                                │
│  Assertions: Vitest expect                              │
│                                                         │
│  Test Infrastructure:                                   │
│  • testAgent.ts - Authenticated HTTP test client        │
│  • mockServiceFactory.ts - In-memory service mocks      │
│  • testEnvironment.ts - Test database configuration     │
│  • seedAuthorizationFixtures.ts - Test data factories   │
│                                                         │
│  Test Types:                                            │
│  • Unit tests (services, repositories, utilities)       │
│  • Integration tests (API routes with authentication)   │
│  • Authorization tests (permission verification)        │
│  • Event bus tests (event handling)                     │
│                                                         │
│  Location: server/tests/                                │
└─────────────────────────────────────────────────────────┘
```

### Test Patterns

**Frontend Testing:**
```typescript
// Component testing with Testing Library
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'

test('renders button with text', () => {
  render(<Button>Click me</Button>)
  expect(screen.getByText('Click me')).toBeInTheDocument()
})

// Hook testing
import { renderHook } from '@testing-library/react'
import { useAuth } from '@/features/auth/hooks/use-auth'

test('useAuth returns user', () => {
  const { result } = renderHook(() => useAuth())
  expect(result.current.user).toBeDefined()
})
```

**Backend Testing:**
```typescript
// API integration testing with authenticated agent
import { testAgent } from './utils/testAgent'

test('authorized user can view candidate', async () => {
  const agent = testAgent({ role: 'hr_staff' })
  const res = await agent.get('/api/candidates/123')
  expect(res.status).toBe(200)
})

// Service testing with mock factory
import { MockServiceFactory } from './utils/mockServiceFactory'

test('candidate service creates candidate', async () => {
  const factory = new MockServiceFactory()
  const service = factory.getCandidateService()

  const candidate = await service.createCandidate(data)
  expect(candidate).toBeDefined()
})
```

### Test Commands

```bash
# Run all tests
npm test

# Frontend tests only
npm run test:frontend

# Backend tests only
npm run test:backend

# Specific test suites
npm run test:auth        # Authentication tests
npm run test:routes      # Route integration tests
npm run test:db          # Database tests

# Watch mode (Vitest)
npm run test:watch

# Interactive UI (Vitest)
npm run test:ui

# Coverage report
npm run test:coverage
```

### Test Coverage

**Current Coverage Areas:**
- ✅ Authentication & authorization flows
- ✅ API route integration tests
- ✅ Repository CRUD operations
- ✅ Service business logic
- ✅ Event bus and event handlers
- ✅ Notification creation and delivery
- ✅ Comment system with visibility
- ✅ User preferences management
- ✅ Utility functions (search, date, task status)

**Test Infrastructure Features:**
- ✅ **Mock service factory** - Replace database with in-memory mocks
- ✅ **Authenticated test agents** - Test with different user roles
- ✅ **Fixture factories** - Generate consistent test data
- ✅ **Test isolation** - Each test runs independently
- ✅ **Type safety** - Full TypeScript support in tests

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

## Key Features & Capabilities

### 1. Candidate Management
- **CRUD Operations:** Create, view, update, archive, and restore candidates
- **Rich Profiles:** Name, contact info, type, rank, department, division, hire date
- **Ownership:** Primary owner and manager assignment with scoped access
- **Followers:** Users can follow candidates for notifications
- **Stage Tracking:** Visual pipeline with drag-and-drop stage progression
- **History:** Complete audit trail of stage changes
- **Status:** Active, archived, or withdrawn with soft deletion
- **Search & Filters:** Full-text search across candidate fields
- **Linking:** Connect candidate profile to system user account

### 2. Template-Based Workflows
- **Template Builder:** Define reusable hiring workflows with stages and tasks
- **Stage Configuration:** Organize workflow into pre-hire and post-hire phases
- **Task Templates:** Configure tasks with due date rules, priorities, categories
- **Assignment Rules:** Specify task assignees by role or specific user
- **Due Date Rules:**
  - Relative to hire date (business days)
  - Relative to anchor task completion
  - Fixed dates
  - Business day calculations
- **Template Expansion:** Apply template to candidate, generating all tasks
- **Lock-in:** Templates snapshot at application time for consistency
- **Cloning:** Duplicate existing templates for quick iteration

### 3. Task Management
- **Task Definitions:** Create reusable task templates independent of candidates
- **Candidate Tasks:** Tasks specific to individual candidates
- **Status Tracking:** Todo, in progress, completed, canceled
- **Assignments:** Assign to specific users or roles (auto-assigned on creation)
- **Due Dates:** Automatic calculation based on hire date and business days
- **Priorities:** High, medium, low prioritization
- **Categories:** Organize tasks by category (HR, IT, Facilities, etc.)
- **My Tasks View:** Personal task list filtered by assignment
- **Completion Tracking:** Mark complete with timestamp
- **Anchor Dependencies:** Tasks can wait on predecessor task completion

### 4. Collaboration & Communication
- **Comments:**
  - Thread comments on candidates and tasks
  - Internal (staff-only) vs. external (candidate-visible) visibility
  - Nested replies support
  - @mentions for user notifications
  - Rich text editing with TipTap
  - Soft deletion with cascading to replies
- **Activity Feed:** Comprehensive audit log of all actions
- **Real-time Updates:** TanStack Query for automatic cache invalidation

### 5. Notification System
- **Multi-Channel:**
  - In-app notifications with unread badges
  - Email notifications via SMTP
- **Event-Driven:** Automatic notifications from domain events
- **User Preferences:**
  - Choose notification channels (in-app, email)
  - Digest frequency (immediate, hourly, daily, weekly, none)
  - Quiet hours configuration
  - Event subscription management
  - Self-notification opt-in/out
- **Deduplication:** Prevent duplicate notifications via keys
- **@Mentions:** Automatic notifications when mentioned in comments
- **Reliable Delivery:** Outbox pattern with retry logic

### 6. Multi-Provider Authentication
- **Local Authentication:**
  - Username/password with bcrypt and scrypt hashing
  - Invitation-based account setup and admin password management
  - Account status management
- **LDAP Integration:**
  - Enterprise directory integration
  - Configurable bind DN and search filters
  - Automatic user provisioning
- **OAuth Providers:**
  - Google OAuth 2.0
  - Azure AD OAuth
  - Automatic identity linking
- **Provider Management:**
  - Enable/disable providers dynamically
  - Multi-provider identity mapping
  - Single user with multiple identities

### 7. Authorization & Access Control
- **Role-Based Access Control (RBAC):**
  - `system_admin` - Full system access
  - `hr_staff` - All candidates and workflows
  - `department_admin` - Department-scoped access
  - `division_leader` - Division-scoped access
  - `manager` - Assigned candidates only
  - `candidate` - Self-service portal (future)
- **Policy-Based Authorization:**
  - CandidatePolicy for candidate operations
  - TaskPolicy for task operations
  - Resource-level permission checks
- **Scoping:**
  - Department-level access restrictions
  - Division-level access restrictions
  - Manager-specific candidate access
- **Authorization Context:** Rich context with user, roles, scopes

### 8. Dashboard & Analytics
- **Dashboard Metrics:**
  - Candidate counts by stage
  - Task completion statistics
  - Recent activity feed
  - Upcoming deadlines
- **Search:**
  - Global search across candidates and tasks
  - Filter by department, division, status, stage
  - Sort by various fields
- **Reporting:**
  - CSV export capabilities
  - PDF generation (jspdf)

### 9. Settings & Configuration
- **User Preferences:**
  - Notification settings
  - Display preferences
  - Quiet hours configuration
- **System Settings:**
  - Authentication provider configuration
  - SMTP email settings (encrypted)
  - System-wide defaults
- **Organization Management:**
  - Department CRUD
  - Division CRUD
  - Hiring stage configuration
  - Task categories and priorities
- **Reference Data:**
  - Candidate types
  - Faculty ranks
  - Salutations

### 10. Email System
- **SMTP Configuration:**
  - Configurable SMTP server settings
  - Encrypted password storage
  - Test connection functionality
- **Email Templates:**
  - User invitations
  - Notification emails
  - Digest emails
- **Outbox Pattern:**
  - Reliable delivery with retries
  - Scheduled digests (hourly/daily/weekly)
  - Delivery status tracking
  - Background processing

---

## Related Documentation

- **[BOUNDED_CONTEXTS.md](./BOUNDED_CONTEXTS.md)** - Current bounded context map
- **[DOMAIN_GLOSSARY.md](./DOMAIN_GLOSSARY.md)** - Shared domain vocabulary
- **[TEMPLATE_SYSTEM.md](./TEMPLATE_SYSTEM.md)** - Template workflow behavior
- **[MIGRATIONS.md](./MIGRATIONS.md)** - Migration operations
- **Environment Setup:** `.env.example` - Environment variable template

---

## Architecture Summary

**OnBoardPro** is a production-ready, enterprise-grade hiring and onboarding management system built with modern web technologies and architectural best practices.

### Architectural Strengths

✅ **Type Safety** - End-to-end TypeScript with strict mode and runtime validation
✅ **Layered Architecture** - Clear separation: Routes → Services → Repositories → Database
✅ **Event-Driven** - Decoupled domain events with EventBus for extensibility
✅ **Policy-Based Authorization** - Fine-grained access control with RBAC and scoping
✅ **Service Factory Pattern** - Dependency injection for testability and maintainability
✅ **Repository Pattern** - Clean data access abstraction with base repository
✅ **Outbox Pattern** - Reliable notification delivery with retries and digests
✅ **Comprehensive Testing** - Frontend (Vitest) + Backend (Node test runner) with high coverage
✅ **Multi-Provider Auth** - Flexible authentication (local, LDAP, OAuth)
✅ **Mobile-First UI** - Responsive design with shadcn/ui and Radix components
✅ **Developer Experience** - Hot reload, TypeScript, organized code structure

### Technology Highlights

- **Frontend:** React 18 + TanStack Query + Wouter + Radix UI + TailwindCSS
- **Backend:** Express.js + Drizzle ORM + Passport.js + Zod validation
- **Database:** PostgreSQL (Docker local image currently `postgres:17.6`) with normalized relational schemas
- **Testing:** Vitest + Node test runner + Supertest + custom test infrastructure
- **Security:** Helmet, bcrypt/scrypt, CSRF protection, rate limiting, encrypted secrets

### Scale & Performance

- **Database:** Connection pooling, indexed queries, soft deletes
- **Caching:** TanStack Query client-side, ETag support
- **Optimization:** Response compression, code splitting, lazy loading
- **Background Jobs:** Deadline scanning, email delivery, notification cleanup
- **Rate Limiting:** DB-backed IP-based counters, configurable default + sensitive policies

### Production Readiness

✅ Health check endpoints (`/health`, `/health/ready`, `/health/live`)
✅ Graceful shutdown handling
✅ Request ID tracking for distributed tracing
✅ Structured error handling with custom error types
✅ Environment-based configuration with validation
✅ Docker support for local development
✅ Migration system (Drizzle Kit)
✅ 12-factor app compliance

### Areas for Future Enhancement

1. **Horizontal Scaling:** Extract background jobs to separate workers
2. **Distributed Caching:** Add Redis for high-throughput rate-limit counters and caching
3. **Message Queue:** Implement Bull/BullMQ for job processing
4. **Observability:** Add Prometheus metrics and distributed tracing
5. **Database Scaling:** Read replicas for query scaling
6. **CDN:** Static asset delivery optimization

---

**Last Updated:** 2026-02-18
**Version:** 1.0.0
**Architecture Health Score:** 8.0/10

**Maintained By:** Jonathan Steen - jesteen@uabmc.edu
**License:** MIT
**Node.js Version:** 22.21.0
**Database:** PostgreSQL 17+ (local Docker), managed Postgres supported
