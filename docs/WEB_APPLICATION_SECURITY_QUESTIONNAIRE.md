# Web Application Security Questionnaire

**Hiring Pipeline Management for OBGYN (In-house development/hosting)**

**Application:** OnBoardPro — Hiring Pipeline Management System

**Description:** OnBoardPro is a hiring pipeline management system used to track and manage the entire employee onboarding lifecycle. It provides template-driven workflows, task management with role-based assignments, candidate tracking through configurable hiring stages, and automated notifications. The system supports multi-provider authentication (local, LDAP, OAuth), comprehensive audit logging, and email-based notifications via SMTP integration.

---

## 1. Discuss your hosting option. (UAB, AWS, Azure, On-premises, Other)

Our OnBoardPro instance will be hosted on an internal university server. The server environment includes Node.js 22 as the application runtime, Express.js as the web framework, and PostgreSQL 16 as the database. Nginx serves as the reverse proxy, handling SSL termination and forwarding requests to the Node.js process. PM2 is used for Node.js process management, ensuring automatic restarts and zero-downtime deployments. This setup ensures full control over the hosting infrastructure, allowing us to tailor security and performance settings to meet our specific requirements.

---

## 2. What security services from the hosting vendor will be used to protect this application?

Our server is secured within our internal network, ensuring it is inaccessible from outside the university's network. This internal-only access reduces the risk of external threats and unauthorized access. Additionally, we employ network firewalls and access control lists (ACLs) to further safeguard the server from potential internal threats.

---

## 3. Have you completed the Cloud Security Alliance (CSA) assessment?

We have not completed the Cloud Security Alliance (CSA) assessment. However, we adhere to internal security protocols and conduct regular security audits to ensure compliance with university security policies and best practices.

---

## 4. Can you provide an overall system and/or application architecture documentation?

Yes. A detailed architecture document is maintained alongside the codebase (see `docs/ARCHITECTURE.md`). The high-level architecture is summarized below:

### System Components

- **Web Server / Reverse Proxy:**
  - **Software:** Nginx
  - **Purpose:** SSL/TLS termination, static asset serving, HTTP request forwarding to the Node.js application, response compression, and load balancing.

- **Application Server:**
  - **Software:** Node.js 22 + Express.js 4.21 (TypeScript)
  - **Purpose:** Executes the OnBoardPro server application, processes REST API requests, handles authentication, authorization, business logic, background job processing (deadline scanning, email delivery, notification cleanup), and serves the production-built React SPA.

- **Database Server:**
  - **Software:** PostgreSQL 16
  - **Purpose:** Stores all application data including user accounts, candidate records, task definitions, templates, notifications, audit logs, session data, and system configuration. Provides data retrieval and storage via the Drizzle ORM with type-safe queries.

- **Client Application:**
  - **Software:** React 18 Single Page Application (TypeScript)
  - **Purpose:** Provides the browser-based user interface with client-side routing (Wouter), server state management (TanStack Query), accessible UI components (Radix UI / shadcn), and form validation (React Hook Form + Zod).

### Data Flow

- **User Interaction:**
  - Users access the OnBoardPro web interface through their browsers via HTTPS.
  - The reverse proxy terminates SSL and forwards requests to the Node.js application server.
  - API requests are validated, authenticated via session cookies, authorized via role-based and scope-based checks, and processed by the service layer before interacting with the PostgreSQL database via Drizzle ORM.

- **Pipeline Management:**
  - Staff log in to manage candidates, assign tasks, advance hiring stages, and monitor progress.
  - All actions are processed through a layered architecture (Routes → Services → Repositories → Database).
  - Domain events trigger side effects such as notifications, email outbox entries, and audit log records.

### Architecture Diagram

```
┌────────────────────────────────────────────────────────┐
│                   Client (Browser)                     │
│              React 18 + TypeScript SPA                 │
│   Wouter · TanStack Query · Radix UI · TailwindCSS    │
└───────────────────────┬────────────────────────────────┘
                        │ HTTPS (REST API + Session Cookies)
                        ▼
┌────────────────────────────────────────────────────────┐
│            Reverse Proxy (Nginx / IIS)                 │
│        SSL termination · Static assets · Gzip          │
└───────────────────────┬────────────────────────────────┘
                        │ HTTP (localhost)
                        ▼
┌────────────────────────────────────────────────────────┐
│             Node.js 22 + Express.js 4.21               │
│                                                        │
│  Middleware: Helmet · Compression · Request ID ·       │
│    Session · Rate Limiter · CSRF · Authorization       │
│                                                        │
│  Features: Auth · Candidates · Tasks · Templates ·     │
│    Notifications · Email · Audit · Search              │
│                                                        │
│  Background Jobs: Deadline Scanner ·                   │
│    Email Processor · Notification Cleanup              │
│                                                        │
│  Events: EventBus (pub/sub) → Notification Handler ·   │
│    Audit Logger · Email Outbox                         │
└───────────────────────┬────────────────────────────────┘
                        │ Drizzle ORM (SQL)
                        ▼
┌────────────────────────────────────────────────────────┐
│                   PostgreSQL 16                        │
│   30+ tables · Session store · Audit log · Outbox      │
└────────────────────────────────────────────────────────┘
```

A full diagram and detailed component breakdown can be provided upon request.

---

## 5. What is the data classification for the project?

The data classification for the project is **Sensitive/Internal**. This classification indicates that the data handled by OnBoardPro includes sensitive information intended for internal use within the university. The data consists of employee demographic information, hiring pipeline status, task assignments, and organizational structure. All access is restricted to the internal network. Appropriate security measures are implemented to protect this data from unauthorized access and disclosure. The system is strictly for hiring pipeline management and task tracking.

---

## 6. Describe the application development lifecycle, including security activities.

The application development lifecycle for OnBoardPro includes planning, design, development, testing, deployment, and maintenance. Security activities are integrated throughout this process, including:

- **Secure coding practices:** TypeScript strict mode, Zod schema validation on all API inputs, parameterized queries via Drizzle ORM (preventing SQL injection), and CSRF token validation on all state-changing requests.
- **Code reviews:** All changes undergo peer review before merging.
- **Static code analysis:** Codacy CLI integration for automated code quality and security analysis on every change. CodeQL via GitHub for vulnerability scanning.
- **Automated testing:** Comprehensive test suites (Vitest for frontend, Node.js test runner for backend) including unit, integration, and API tests with authentication mocking.
- **Dependency scanning:** Regular vulnerability scanning of third-party dependencies.
- **Security headers:** Helmet.js enforces Content Security Policy, X-Content-Type-Options, X-Frame-Options, and other protective headers.

---

## 7. Describe your change management process.

The change management process includes:

1. Initiating change requests via GitHub Issues or pull requests.
2. Reviewing and assessing proposed changes for impact and risk.
3. Peer code review with automated CI checks (linting, type-checking, tests, Codacy analysis).
4. Planning and communicating changes to stakeholders.
5. Deploying changes during scheduled maintenance windows.
6. Verifying post-deployment via health check endpoints (`/health/ready`, `/health/live`).
7. Documenting all changes in commit history, pull request descriptions, and migration files.
8. Continuous improvement through retrospectives and architecture reviews.

---

## 8. What third-party components, libraries, or frameworks are used? How are they managed for security?

OnBoardPro uses the following key third-party components:

**Backend:**
- Node.js 22, Express.js 4.21, TypeScript 5.6
- PostgreSQL 16 (via pg / Drizzle ORM)
- Passport.js (authentication), bcrypt + scrypt (password hashing)
- ldapjs (LDAP authentication), Nodemailer (SMTP email delivery)
- Helmet (security headers), Zod (input validation)
- express-session + connect-pg-simple (session management)

**Frontend:**
- React 18, Vite 7, TanStack Query 5
- Radix UI (accessible components), TailwindCSS (styling)
- React Hook Form + Zod (form validation)
- Wouter (routing), Framer Motion (animations)

**Testing:**
- Vitest, @testing-library/react, Supertest, happy-dom

These components are managed for security through:
- Regular updates to the latest stable versions.
- Sourcing from trusted repositories (npm registry).
- Automated vulnerability scanning via `npm audit` and Codacy/Trivy.
- Lock file (`package-lock.json`) to ensure reproducible builds.
- Version pinning where necessary to avoid unexpected breaking changes.

---

## 9. What is your patch management process?

The patch management process involves:

1. Identifying patches and security advisories via `npm audit`, GitHub Dependabot alerts, and Codacy/Trivy scanning.
2. Evaluating patches for relevance and impact to the application.
3. Testing patches in a development environment with the full test suite.
4. Deploying patches during maintenance windows after verification.
5. Verifying success via health check endpoints and application monitoring.
6. Documenting patch history in version control.
7. Continuous improvement of the patching process.

---

## 10. How do you ensure secure coding practices?

Secure coding practices are ensured through:

- **TypeScript strict mode** with comprehensive type checking across the full stack.
- **Input validation** on all API endpoints using Zod schemas with middleware-enforced validation.
- **Parameterized queries** via Drizzle ORM, preventing SQL injection.
- **CSRF protection** on all state-changing API requests with session-bound tokens.
- **Rate limiting** on API endpoints (general and sensitive routes like authentication) backed by database counters.
- **Content Security Policy** and security headers via Helmet.js.
- **Password security:** bcrypt + scrypt hashing, constant-time comparison (timing-attack safe), 10,000+ common password blocklist, and configurable password policies (12+ characters, mixed case, numbers, special characters).
- **Session security:** Secure, httpOnly, sameSite=strict cookies with idle timeout (2 hours default) and absolute timeout (24 hours default).
- **Code reviews** with automated static analysis (Codacy CLI, CodeQL).
- **Audit logging** of all CRUD operations, authorization failures, and sensitive actions.
- **Environment variable validation** at startup via Zod schema (enforces minimum session secret length, required database URL, etc.).

---

## 11. What security testing is performed?

Security testing encompasses:

- **Static Application Security Testing (SAST):** Codacy CLI integration for automated analysis on every code change. CodeQL via GitHub for deep vulnerability scanning.
- **Dependency vulnerability scanning:** `npm audit`, Trivy (via Codacy MCP), and GitHub Dependabot for known CVE detection in dependencies.
- **Automated test suites:** Backend integration tests simulate authenticated API requests with role-based access control verification. Frontend component tests ensure proper rendering and user interaction.
- **Input validation testing:** Zod schema validation tests ensure malformed inputs are rejected at the API boundary.
- **Rate limiting verification:** API rate limiting tested to confirm proper enforcement on sensitive endpoints.
- **Security audits:** Periodic reviews of security policies, procedures, and controls to ensure compliance.

---

## 12. How is sensitive data protected?

Sensitive data is protected through:

- **Network isolation:** Application accessible only within the internal university network.
- **Encryption in transit:** TLS/SSL via the reverse proxy for all HTTP traffic.
- **Encryption at rest:** PostgreSQL data-at-rest encryption; SMTP credentials stored with application-level encryption in the database.
- **Password hashing:** bcrypt + scrypt with salting; constant-time comparison to prevent timing attacks; common password blocklist (10,000+ entries).
- **Access controls:** Role-based access control (RBAC) with six roles (`system_admin`, `hr_staff`, `department_admin`, `division_leader`, `manager`, `candidate`) plus scope-based restrictions (department/division).
- **Session security:** Secure, httpOnly, sameSite=strict cookies; idle and absolute session timeouts; PostgreSQL-backed session store.
- **CSRF protection:** Token-based CSRF validation on all state-changing API requests.
- **Audit logging:** Comprehensive audit trail of all data access and modifications with actor tracking.
- **Data minimization:** Only necessary employee information is collected and stored.

---

## 13. What authentication mechanisms are used?

OnBoardPro supports multi-provider authentication via a pluggable Provider Registry:

- **Local authentication:** Username/password with bcrypt + scrypt password hashing, constant-time comparison, and strong password policies (12+ characters, mixed case, number, special character, common password blocklist).
- **LDAP integration:** Enterprise directory authentication providing single sign-on (SSO) capability, configurable via the admin UI with bind DN and search base settings.
- **OAuth 2.0 providers:** Google and Azure AD OAuth integration for federated authentication via Passport.js strategies.
- **Session management:** Server-side sessions stored in PostgreSQL with secure, httpOnly, sameSite=strict cookies. Rolling 10-hour cookie expiration with configurable idle timeout (default 2 hours) and absolute timeout (default 24 hours).
- **Multi-identity linking:** Users can link multiple authentication providers to a single account via the `user_identities` table.

---

## 14. How is access control managed?

Access control is managed through:

- **Role-Based Access Control (RBAC):** Six defined roles with hierarchical permissions — `system_admin`, `hr_staff`, `department_admin`, `division_leader`, `manager`, `candidate`.
- **Scope-based authorization:** Department and division scoping ensures users only see and modify resources within their organizational boundaries.
- **Policy-based checks:** Resource-level authorization policies (CandidatePolicy, TaskPolicy) enforce fine-grained permission checks on every API request.
- **Authorization context:** Each authenticated request builds an `AuthContext` with the user's roles, department, and division scopes for consistent permission evaluation.
- **Least privilege principle:** Users are granted only the minimum permissions necessary for their role.
- **Audit logging:** All authorization failures are logged with `access_denied` action type for monitoring and review.
- **Regular access reviews:** User roles and permissions are periodically reviewed to maintain appropriate access levels.

---

## 15. What logging and monitoring is in place?

Logging and monitoring include:

- **Request logging:** All API requests logged with unique request IDs (UUID) for correlation, including method, path, status code, and duration.
- **Audit trail:** Comprehensive `audit_log` table tracking all CRUD operations across the system with resource type, resource ID, action, actor ID, and request correlation IDs.
- **Authorization metrics:** Failed authorization attempts tracked via `authMetrics` observability module.
- **Error logging:** Structured error logging with environment-aware log levels (`debug`, `info`, `warn`, `error`, `silent`).
- **Health check endpoints:** `/health`, `/health/ready`, `/health/live` for application monitoring and load balancer integration.
- **Background job monitoring:** Deadline scanner, email processor, and notification cleanup jobs log their execution status.
- **Rate limit monitoring:** Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) on API responses for client-side observability.
- **Event bus logging:** Domain event middleware logs all published events and handler execution.

---

## 16. How is incident response handled?

Incident response involves:

1. **Detection:** Monitoring health check endpoints, audit logs, error logs, and rate limit violations for anomalies.
2. **Reporting:** Incidents reported via internal channels and tracked through issue management.
3. **Triage:** Assessment of severity and impact based on affected systems, data exposure, and user impact.
4. **Containment:** Session invalidation, account locking, rate limit enforcement, and network-level access restrictions as appropriate.
5. **Investigation:** Audit log analysis with request ID correlation, database query review, and access log examination.
6. **Remediation:** Patching vulnerabilities, updating configurations, rotating secrets (session secret, SMTP credentials), and deploying fixes.
7. **Communication:** Notifying affected users and stakeholders as required by university policy.
8. **Documentation:** Recording incident details, root cause analysis, and remediation steps.
9. **Post-incident review:** Conducting retrospectives to identify improvements.
10. **Training and awareness:** Updating procedures and training based on lessons learned.

---

## 17. What backup and recovery processes are in place?

Backup and recovery processes include:

- **Codebase version control:** GitHub for full source code history, branching, and collaboration.
- **Database backups:** Automated daily PostgreSQL backups using `pg_dump` with point-in-time recovery capability.
- **Database migrations:** Versioned SQL migration files (`migrations/`) providing a complete, reproducible schema history with forward-only migration support.
- **Configuration backups:** Environment configuration documented and version-controlled (with secrets excluded from version control via `.gitignore`).
- **Backup verification:** Regular restoration tests to validate backup integrity.
- **Disaster recovery plan:** Documented procedures for full system restoration from backups including database restore, application redeployment, and configuration recovery.
- **Data seeding:** Sample data scripts (`initdb/phase5_sample_data.sql`) available for rapid environment provisioning.

---

## 18. How is network security enforced?

Network security is enforced through:

- **Internal network isolation:** Application server accessible only from within the university network, reducing external attack surface.
- **Firewall rules:** Network firewalls restricting inbound/outbound traffic to authorized ports and protocols only.
- **Reverse proxy:** Nginx serves as the entry point, handling SSL/TLS termination and shielding the Node.js application from direct client connections.
- **Access control lists (ACLs):** Fine-grained network access controls limiting connectivity between servers.
- **Secure communication protocols:** TLS 1.2+ enforced for all HTTP traffic; PostgreSQL connections use SSL where available.
- **Trusted proxy configuration:** Express configured with `TRUSTED_PROXIES` to correctly resolve client IP addresses behind the reverse proxy while preventing IP spoofing.
- **Rate limiting:** Database-backed IP-based rate limiting on API endpoints to prevent abuse (200 requests/minute general, 60 requests/minute on sensitive routes).
- **Security headers:** Helmet.js enforces Content-Security-Policy, X-Content-Type-Options (nosniff), X-Frame-Options (DENY), and other protective headers.
- **Patch management:** Regular updates to Node.js, PostgreSQL, and all system components.
- **Monitoring:** Continuous monitoring of health endpoints, request logs, and rate limit violations.

---

## 19. What physical security measures are in place?

Physical security measures include:

- Secure data center access with electronic access control systems.
- 24/7 surveillance and monitoring of server facilities.
- Environmental controls (climate, fire suppression) in server rooms.
- Secure server racks with restricted physical access.
- Redundant power supplies and UPS systems.
- Visitor management and escorted access policies.
- Regular physical security audits.
- Policy documentation and staff training on physical security procedures.

---

## 20. How is vendor security managed?

No outside vendor will have access to the system. The application is developed and maintained in-house. All third-party components are open-source libraries sourced from the npm registry, reviewed for security prior to adoption, and regularly updated. No vendor has direct access to the production environment, database, or sensitive configuration.

---

## 21. How is user training and awareness handled?

User training and awareness include:

- **Initial onboarding training** for new users on system functionality and security practices.
- **Role-based training** tailored to each user role (system admin, HR staff, department admin, manager, etc.).
- **Documentation:** Comprehensive user guides (`docs/GETTING_STARTED_GUIDE.md`, `docs/GETTING_STARTED_TUTORIAL.md`, etc.) and template system documentation.
- **Security awareness:** Training on password policies, session management, and data handling best practices.
- **Feedback mechanisms:** Dedicated channels for user feedback on training materials and system usability.
- **Policy updates:** Users informed of policy changes via email and direct communication.
- **Incident reporting:** Training on recognizing and reporting security incidents through established channels.
- **Continuous improvement:** Regular evaluation and updates to training materials based on user feedback and system changes.

---

## System and Application Architecture Documentation

### 1. Overview

OnBoardPro is an in-house hiring pipeline management system that enables departments to manage, track, and automate the employee onboarding lifecycle. It provides template-driven workflows, configurable hiring stages, role-based task assignments, notification delivery, and comprehensive audit logging.

### 2. System Components

| Component | Software | Purpose |
|-----------|----------|---------|
| **Reverse Proxy** | Nginx | SSL/TLS termination, static asset serving, request forwarding, load balancing |
| **Application Server** | Node.js 22 + Express.js 4.21 (TypeScript) | REST API processing, authentication, authorization, business logic, background jobs |
| **Database Server** | PostgreSQL 16 | Persistent storage for all application data (30+ tables), session storage, audit logs |
| **Client Application** | React 18 SPA (TypeScript, Vite-built) | Browser-based user interface served as static assets |
| **Process Manager** | PM2 | Node.js process management, auto-restart, log management |

### 3. Network Architecture

The OnBoardPro server is located within the internal university network, isolated from external access. Nginx accepts HTTPS connections from internal clients and forwards requests to the Node.js application on localhost. PostgreSQL accepts connections only from the application server. Network firewalls and ACLs secure communication between all components.

### 4. Data Flow

- **User Interaction:** Users access the OnBoardPro SPA through their browsers via HTTPS. The reverse proxy terminates SSL and forwards API requests to the Express.js server. The server authenticates the session, authorizes the request against role/scope policies, processes business logic through the service layer, and returns JSON responses.

- **Pipeline Management:** Staff manage candidates, tasks, templates, and organizational data through the web interface. All mutations are validated (Zod schemas), processed (service layer), persisted (Drizzle ORM → PostgreSQL), and audited (audit_log table). Domain events trigger notifications, email outbox entries, and activity logging.

- **Background Processing:** Three background jobs run within the Node.js process: deadline scanning (identifies approaching/overdue tasks), notification email processing (sends queued emails via SMTP), and notification cleanup (purges expired notifications).

### 5. Security Measures

- Internal network-only access, minimizing external attack surface.
- TLS/SSL termination at the reverse proxy for all client traffic.
- Helmet.js security headers (CSP, X-Frame-Options, X-Content-Type-Options, etc.).
- CSRF token validation on all state-changing API requests.
- Database-backed rate limiting with configurable thresholds.
- bcrypt + scrypt password hashing with constant-time comparison.
- Role-based access control (6 roles) with department/division scoping.
- Comprehensive audit logging of all CRUD operations and authorization failures.
- Idle (2h) and absolute (24h) session timeouts with PostgreSQL session store.
- Input validation via Zod schemas on every API endpoint.
- Common password blocklist (10,000+ entries) enforced at password creation.

### 6. Backup and Recovery

- GitHub for codebase version control with full commit history.
- Automated daily PostgreSQL backups via `pg_dump`.
- Versioned SQL migration files for reproducible schema history.
- Regular backup verification and restoration testing.
- Documented disaster recovery procedures.
