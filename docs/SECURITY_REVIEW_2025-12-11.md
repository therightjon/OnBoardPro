# OnBoardPro Security Assessment (Independent)

**Date:** 2025-12-11  
**Auditor:** Codex (independent review)  
**Scope:** Application backend (Express/Drizzle), frontend (React/TanStack), auth flows, data handling, infrastructure configs, and supply chain.  
**Method:** Static code review only (no runtime testing, no dependency scans due to read-only sandbox).

## Executive Summary

Overall security posture is **B- (good foundations, notable gaps)**. Strong RBAC scaffolding, audit logging, request correlation, and scrypt-based password hashing are in place. The largest gaps are missing CSRF protections for the cookie-authenticated API, long-lived sessions without rotation/idle expiry, lack of password complexity + per-account lockout, permissive CSP/headers, and verbose API response logging that can leak PII. Dependency hygiene and secrets handling need process hardening.

## Week 1 To-Do (live tracking)
- [x] Add CSRF protection for state-changing `/api` routes and expose a token endpoint; include token in client mutations.
- [x] Reduce session cookie lifetime to 10 hours, add 2-hour idle timeout with rolling renewal, and regenerate session IDs on login/provider sign-in.
- [x] Stop logging full `/api` response bodies (log metadata only).
- [x] Remove committed session cookie artifact (`cookies_login.txt`) and rely on `.gitignore` pattern.

## High-Level Strengths
- Server-side sessions with HttpOnly + SameSite=Strict cookies; credentials always sent with `credentials: "include"` on the client.
- RBAC enforcement helpers and per-resource policies; invitation-based onboarding prevents open registration.
- Audit logging of CRUD/authz denials and request correlation IDs for forensics.
- Password hashes use scrypt with per-user random salt; legacy bcrypt comparison still supported.
- Environment validation via Zod prevents boot with missing secrets/config.

## Top Risks to Address First
1) **No CSRF defense on state-changing cookie-auth endpoints** – all `/api` mutations are exposed to cross-site requests.  
2) **Sessions are long-lived (7 days), no idle timeout or rotation** – increases session hijack window.  
3) **No password strength/complexity checks and no account lockout** – enables weak credentials and brute force.  
4) **CSP allows `unsafe-inline` and is disabled in development; other security headers are minimal** – XSS and clickjacking risk.  
5) **API logger records full JSON responses for all `/api` calls** – potential PII leakage and log injection.  
6) **Rate limiting is IP-only, in-memory, and permissive; no login-specific throttling**.  
7) **Secrets hygiene: session cookie file committed; partial SESSION_SECRET logged in dev; no vault/KMS guidance.**

## Findings and Recommendations

### Critical
- **Missing CSRF protection for cookie-auth API**  
  - **Evidence:** Server uses `express-session` cookies for auth but no CSRF middleware/tokens anywhere in `/api` routing stack; client only sets `credentials: "include"`. (`server/features/auth/services/auth.service.ts:122-219`, `client/src/lib/queryClient.ts:28-86`).  
  - **Impact:** Authenticated users can be tricked into state-changing requests from malicious origins; SameSite helps but is bypassable (e.g., older browsers, misconfig, same-site subdomain).  
  - **Remediation:** Add CSRF tokens (e.g., `csurf` with double-submit cookie) to mutating routes, expose `/api/csrf-token`, and send `X-CSRF-Token` from the client. If keeping pure API clients, gate CSRF to cookie-auth flows only.

### High
- **Session hardening gaps**  
  - **Evidence:** Cookies live 7 days, no idle timeout or rotation after privilege changes/password update. (`server/features/auth/services/auth.service.ts:137-157`).  
  - **Impact:** Prolonged hijack window; privilege escalation persists within same SID.  
  - **Remediation:** Shorten default maxAge (e.g., 1h) with optional "remember me" flag; add idle timeout + rolling sessions; regenerate session ID on login, role changes, and password resets; limit concurrent sessions per user.

- **No password complexity enforcement**  
  - **Evidence:** Passwords are hashed but never validated for length/complexity/banlist. (`server/services/users/user.service.ts:70-117`).  
  - **Impact:** Weak passwords and reuse enable credential stuffing.  
  - **Remediation:** Enforce minimum length (>=12), character class mix, common-password blacklist, and strength check (e.g., zxcvbn) before hashing.

- **Permissive CSP and missing hardened headers**  
  - **Evidence:** CSP allows `unsafe-inline` scripts/styles and is disabled entirely in dev; no HSTS/referrer-policy tuning. (`server/index.ts:20-31`).  
  - **Impact:** Inline XSS remains exploitable; inconsistent header coverage across environments.  
  - **Remediation:** Replace inline allowances with nonce/sha-based CSP, run in report-only first; add HSTS (prod), `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, and deny framing.

### Medium
- **Rate limiting and lockout are weak**  
  - **Evidence:** IP-only, in-memory limiter defaults to 120 req/min; no login-specific throttling or per-account tracking. (`server/middleware/rate-limiter.ts:6-58`, `server/config/env.ts:16-38`).  
  - **Impact:** Brute force/credential stuffing viable; distributed attacks bypass IP buckets.  
  - **Remediation:** Introduce login-specific limiter (e.g., 5 attempts/15m, failures-only), per-identity tracking, exponential backoff, optional CAPTCHA, and store counters in Redis/Postgres for multi-node.

- **Verbose API response logging (PII leakage & log injection)**  
  - **Evidence:** Middleware serializes every `/api` JSON response body into logs. (`server/index.ts:43-70`).  
  - **Impact:** Sensitive data (PII, auth decisions) written to logs; attacker-controlled fields can poison log search/alerting.  
  - **Remediation:** Stop logging full bodies; log minimal metadata (route, status, latency, requestId, actor) and cap payload size; sanitize/escape fields.

- **Input validation gaps on search endpoints**  
  - **Evidence:** Search queries are passed straight to DB via parameterized `ILIKE` with no length/character limits or debouncing. (`server/routes/search.routes.ts:88-149`, `server/repositories/SearchRepository.ts:34-112`).  
  - **Impact:** Potential heavy queries/DoS and noisy logs; while Drizzle parameterizes input, unbounded wildcard search can be abused.  
  - **Remediation:** Add schema validation (length cap, allowed chars), trim wildcards, and consider rate limits per user for search.

- **Dependency & supply-chain hygiene**  
  - **Evidence:** No automated SCA/Dependabot; `node` is listed as a runtime dependency; cannot verify CVEs due to read-only environment. (`package.json`).  
  - **Impact:** Stale packages or malicious transitive updates could slip in unnoticed.  
  - **Remediation:** Add Dependabot/Renovate, run `npm audit`/`npm outdated` in CI, pin Node in engines not deps, and add SAST/lockfile integrity checks.

- **Secrets handling weaknesses**  
  - **Evidence:** Session cookie artifact committed (`cookies_login.txt`); dev env logger prints start of `SESSION_SECRET` (`server/config/env.ts:42-48`). No vault/KMS guidance for LDAP creds/SMTP.  
  - **Impact:** Risk of credential reuse/session replay in shared repos; secrets may leak in logs.  
  - **Remediation:** Remove committed cookies, add `.gitignore` for artifacts, avoid logging secrets, and document vault/KMS usage with per-env service accounts.

### Low / Observations
- **MFA absent** – no TOTP/WebAuthn hooks; add especially for admins and HR staff.  
- **API versioning/deprecation** – single `/api` surface with no versioning; plan v1/v2 for future breaking changes.  
- **Data-at-rest/transport** – Postgres in `docker-compose` uses plaintext port 5432 with no TLS or encryption-at-rest settings; ensure prod uses encrypted storage + TLS and restricted security groups.  
- **PII in responses** – Some audit/user endpoints may return full objects; ensure least-privilege serialization for candidate-facing roles (sanitization exists for tasks/candidates but review other DTOs).

## Area Deep Dive

**Authentication & Authorization**
- Session-based auth with Passport local + LDAP provider registry; invitation-only registration blocks self-signup. (`server/features/auth/services/auth.service.ts`).
- Session cookies: HttpOnly + SameSite=Strict + Secure in prod, but long-lived and not rotated. No MFA. Role checks via `requireRole` middleware and policy classes; candidate sanitization exists.
- Missing CSRF protection for cookie-auth flows; OAuth/OIDC stubs not yet implemented.

**Password Policies & Storage**
- scrypt hashing (64-byte, random salt) and legacy bcrypt comparison are solid. No complexity/length enforcement or breached-password checks. Password changes not forced to rotate sessions or invalidate other sessions.

**Session Management**
- Postgres-backed session store; `trust proxy` enabled. No idle timeout, rotation on privilege change, concurrent session limits, or remember-me separation. Logout does not destroy other sessions.

**Input Validation & Data Handling**
- Zod schemas for env and DB types, but request payload validation is inconsistent (e.g., search routes accept raw query params). XSS sanitization for rich text/comments not present; no HTML sanitization library in use.

**API Security**
- Error handler avoids stack traces in prod. No API versioning; no HSTS/CSP hardening; logs include response bodies. CSRF missing for cookie-auth endpoints.

**Data Protection**
- Transport security assumed at infra (not enforced in app). No mention of database encryption/column-level protection; audit logs may contain PII without retention/rotation policy. Secrets reside in env vars without vault process.

**Dependency & Supply Chain**
- Uses modern tooling (Vite, Drizzle, Helmet). No automated CVE scanning or license checks; lockfile present but Node pinned as dependency.

**Logging & Monitoring**
- Audit logger captures actor/resource/action; request IDs used. Response body logging risks PII. No alerting/monitoring hooks found for auth failures beyond metrics stub.

**Business Logic**
- Invitation gating and role-scoped access are strong. Need workflows for session/token rotation after role elevation or password reset. No explicit race-condition controls on status transitions observed (state machine not enforced in routes).

## Recommended Roadmap
1. **Week 1:** Add CSRF tokens for cookie-auth mutations; tighten session lifetime/idle timeout; stop logging response bodies; remove committed cookies.
2. **Weeks 2-3:** Enforce password policy + breached-password checks; add login lockout/per-account throttling; harden CSP/HSTS headers with report-only rollout; add validation on search and other query params.
3. **Month 2:** Introduce MFA for admins/HR; session rotation + concurrent session limits; integrate SCA (Dependabot + CI `npm audit`/`npm outdated`), SAST (Semgrep/Sonar). 
4. **Quarter:** Infra hardening (DB TLS/at-rest encryption, WAF/CDN), secret management via vault/KMS, plan API versioning, and add monitoring/alerting for auth anomalies.
