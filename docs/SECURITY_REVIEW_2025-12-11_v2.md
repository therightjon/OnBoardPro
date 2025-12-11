# Security Review (Re‑evaluation) — 2025‑12‑11

This report re‑evaluates the OnBoardPro codebase with focus on the areas requested. It supersedes `docs/SECURITY_REVIEW_2025-12-11.md`. Findings are based on static analysis of the repository in this workspace; no network‑based dependency scan was run due to restricted network access.

**Scope**
- Server: Express/Passport/Drizzle/Postgres (`server/`, `shared/`, `scripts/`)
- Client: React/Vite (`client/`)
- Infra/config: `docker-compose.yml`, env/config files

**Severity scale**
- **Critical**: Exploitable to gain unauthorized access or major data exposure.
- **High**: Realistic exploitation with significant impact.
- **Medium**: Exploitable with constraints or moderate impact.
- **Low**: Hard to exploit or minor impact; best‑practice gaps.

---

## 1. Authentication & Authorization

### What’s in place
- **Session‑based auth** via `express-session` + Postgres store (`server/features/auth/services/auth.service.ts`).
- **Passport LocalStrategy** for email/password sign‑in.
- **Multi‑provider framework** with Local + LDAP; stubs for OIDC/Google/AzureAD (`server/features/auth/services/*`).
- **Login rate limiting** (per identifier + IP) with retries and reset (`server/services/login-rate-limit`, used in `/api/login`).
- **Policy‑based authorization** for candidates/tasks + role middleware (`server/services/authorization/*`, `server/middleware/authorization.ts`).

### Findings
1. **Critical — LDAP injection in user search filter**
   - `LdapAuthProvider` interpolates `ldapUser` directly into `userFilter` without escaping (`server/features/auth/services/providers.ts`).
   - `toLdapUsername` only trims/lowercases; it does not escape LDAP filter metacharacters (`server/features/auth/identifier.ts`).
   - Impact: attacker may craft usernames like `*)(uid=*)` or `)(|(uid=*))` to alter filter, potentially authenticating as another user or bypassing user lookup logic.

2. **High — StartTLS flag validated but not enforced**
   - Config validation allows `ldap://` + `startTls=true`, but provider never calls `client.starttls(...)` (`server/features/auth/services/providers.ts`, `server/features/auth/services/config.ts`).
   - Impact: deployments expecting StartTLS may silently run plaintext LDAP bind/search, exposing credentials on the wire.

3. **Medium — Provider email‑based linking could enable account takeover for future SSO**
   - `AuthService.findExistingUser` links by verified email if provider claims `emailVerified` (`server/features/auth/services/service.ts`).
   - LDAP provider hard‑sets `emailVerified: true`. Future OIDC/Google/Azure providers must ensure `emailVerified` is trustworthy.
   - Impact: a misconfigured or untrusted IdP could claim another user’s verified email and link identities.

4. **Low — No MFA**
   - No TOTP/SMS/WebAuthn or step‑up auth found.

### Recommendations
- **Escape LDAP filter inputs** (e.g., RFC 4515 escaping) before interpolation; ideally use ldapjs `filters` API or a safe builder.
- **Implement StartTLS** when `startTls` is set, and support CA pinning / custom trust store.
- **Harden account linking**:
  - Prefer linking only by provider `externalId`/subject.
  - If email linking is needed, require admin approval or user confirmation.
- Plan MFA roadmap for privileged roles.

---

## 2. Input Validation & Data Handling

### What’s in place
- **Zod validation** on most routes and shared schemas (`zod/v4`, `@shared/schemas`).
- **Drizzle ORM parameterization** for most DB access.
- **CSRF protection** via `csurf`, applied to all `/api` state‑changing routes except explicit exclusions (`server/routes.ts`, `server/middleware/csrf.ts`).
- **No file upload surface** detected.
- **No `child_process`/exec usage** in server code.

### Findings
1. **Low/Medium — A few admin endpoints accept raw bodies**
   - Example: `/users` create/update passes `req.body` to service without route‑level `.strict()` parsing (`server/routes/users.routes.ts`).
   - Service‑level validation exists for passwords/roles, but other fields rely on repository constraints.
   - Impact: schema drift or unexpected field writes if repo layer doesn’t whitelist.

2. **Low — Potential stored‑XSS depends on client rendering**
   - Comments and other text inputs are stored as strings; no server‑side HTML sanitization.
   - Client appears to render via React without `dangerouslySetInnerHTML` (no matches found), which is safe by default.
   - Impact: if future UI introduces raw HTML rendering, stored XSS risk increases.

### Recommendations
- Add Zod `.strict()` parsing for admin mutation routes to ensure allow‑listed fields.
- Keep comment/task/candidate text rendered as plain text; if rich text is needed, sanitize on write and use a safe renderer.

---

## 3. API Security

### What’s in place
- **Global rate limiting** for `/api` + sensitive limiter on read‑heavy endpoints (`server/middleware/rate-limiter.ts`, used in candidates/tasks).
- **Consistent auth guards** on all API modules; only health/docs are public.
- **Error handler** hides stack/details in production (`server/utils/error-handler.ts`).

### Findings
1. **Medium — Some routes leak error details / log sensitive queries**
   - Search endpoints log raw search queries and use `error.message` in responses (`server/routes/search.routes.ts`).
   - Impact: PII in logs; information disclosure to privileged but non‑admin users.

2. **Low — No API versioning**
   - No `/v1` or deprecation strategy observed.

### Recommendations
- Gate search/debug logging behind `NODE_ENV !== 'production'` and avoid echoing raw queries.
- Standardize error responses through `next(error)` to use global handler.
- Introduce a versioning/deprecation plan as API surface stabilizes.

---

## 4. Data Protection

### What’s in place
- **Passwords hashed with scrypt + per‑user salt** (`server/utils/passwords.ts`) with a strong policy enforced on create/update.
- **Legacy bcrypt support** for existing hashes (`server/features/auth/services/auth.service.ts`).
- **Candidate/task sanitization for candidate role** (`server/utils/sanitization.utils.ts` used in routes).
- **No payload logging in event bus by default** (`server/index.ts`).

### Findings
1. **High — Database TLS not universally enforced; Neon TLS verification disabled**
   - Only auto‑enables TLS for `*.neon.tech`, and uses `rejectUnauthorized: false` (`server/config/database.config.ts`).
   - Other hosts default to plaintext unless URL forces SSL.
   - Impact: MITM risk for Neon; plaintext DB creds/data for non‑Neon prod if misconfigured.

2. **Medium — Data‑at‑rest & local dev exposure**
   - `docker-compose.yml` exposes Postgres on `5432` with no TLS and a host‑mounted volume.
   - Impact: acceptable for dev, but unsafe for prod‑like environments.

3. **Low/Medium — Audit log details may contain PII**
   - `writeAuditLog` stores arbitrary `details` from call sites (`server/services/shared/audit-logger.ts`).

### Recommendations
- **Enforce DB SSL in production** via config flag; remove `rejectUnauthorized: false` and support CA configuration.
- Ensure prod storage uses disk encryption and DB network access is restricted (private subnets, SGs).
- Review audit log payloads; avoid dumping full objects or secrets.

---

## 5. Infrastructure & Configuration

### Findings
1. **Medium — `trust proxy` always enabled**
   - `app.set("trust proxy", 1)` is unconditional (`server/features/auth/services/auth.service.ts`).
   - Impact: if deployed without a trusted proxy in front, clients can spoof `X-Forwarded-For`, affecting rate limiting and login throttling.

2. **Low — CSP allows inline scripts**
   - Production CSP includes `scriptSrc: ["'self'", "'unsafe-inline'"]` (`server/index.ts`).
   - Impact: weakens mitigation if any XSS is introduced.

3. **Low — Postgres session store auto‑creates table**
   - `createTableIfMissing: true` in prod may require elevated DB privileges.

### Recommendations
- Make `trust proxy` conditional on deployment topology (`NODE_ENV` + explicit env flag).
- Remove `'unsafe-inline'` for scripts; use nonces/hashes if inline is required.
- Pre‑provision session table in migrations for production.

---

## 6. Dependencies & Supply Chain

### What’s in place
- Dependency versions are pinned in `package-lock.json`.

### Findings
- **Not scanned for known CVEs in this run** (network restricted).
- Notable higher‑risk deps to keep current: `express`, `passport`, `csurf` (deprecated/unmaintained), `ldapjs`.

### Recommendations
- Run `npm audit --production` and a full SCA tool (Dependabot/Snyk/GitHub Advanced Security).
- Consider migrating from `csurf` to a maintained CSRF solution when feasible.

---

## 7. Logging, Monitoring, Incident Readiness

### What’s in place
- DB‑persisted audit logs for CRUD + auth‑denied events.
- Optional stdout auth‑denied metrics (`AUTH_METRICS_STDOUT`).

### Findings
- **Medium**: Search/debug logging prints user queries in all envs.
- **Low**: Request logs do not sanitize newlines; potential log‑forging edge case.

### Recommendations
- Centralize logging with redaction (PII + secrets), and add alerting for:
  - repeated auth failures,
  - rate‑limit spikes,
  - unusual candidate/task access patterns.
- Sanitize log fields to strip control characters.

---

## 8. Business Logic

### What’s in place
- Candidate/task policies encode scope and role rules.
- Writes usually gated to privileged roles.

### Findings
- No obvious workflow bypass observed in static review.
- Potential future race/consistency risks around stage advancement and bulk task updates if concurrent updates become common.

### Recommendations
- Add transactional guards or optimistic concurrency for stage/task bulk writes if needed.
- Extend policy coverage to remaining resource types as they gain more endpoints.

---

## Priority Fix List

1. **Critical**: Escape LDAP username in filters and add LDAP injection tests.
2. **High**: Implement StartTLS or require LDAPS; enforce TLS verification.
3. **High**: Enforce DB TLS in prod; remove `rejectUnauthorized: false`.
4. **Medium**: Remove PII/debug logging and unify error responses.
5. **Medium**: Conditional `trust proxy`.
6. **Low**: Harden CSP and route‑level strict validation.

---

## Suggested Follow‑ups

- Add security tests:
  - LDAP injection cases.
  - Candidate/manager cross‑scope access attempts.
  - CSRF enforcement on all mutations.
- Automate dependency scanning (CI) and secret detection.
- Document production hardening checklist in `docs/SECURITY_AUDIT.md` or a new `PROD_SECURITY_CHECKLIST.md`.

