# OnBoardPro Security Remediation Plan (Post-Assessment, Invitation Feature Deferred)

## Summary
This plan completes the remaining security fixes while treating invitations as a disabled future feature.  
It implements SBP-005, SBP-006, SBP-007, contains SBP-002 via feature disablement + log sanitization, and records SBP-003 as explicit risk acceptance (per your choice).  
SBP-004 (token-at-rest redesign) is intentionally deferred until invitation feature completion.

## Public API / Interface / Config Changes
1. Add server feature flag `ENABLE_INVITATIONS` (default `false`) in [server/config/env.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/config/env.ts).
2. Add client feature flag `VITE_ENABLE_INVITATIONS` (default `false`) in `.env.example` and client config usage.
3. Invitation endpoints behavior change when disabled:
`POST /api/invitations`, `DELETE /api/invitations/:id`, `POST /api/invitations/accept` return `404`.
4. `/api/users` response behavior change when invitations are disabled:
pending invitation pseudo-users are not included.
5. Session cookie name changes from default `connect.sid` to `obp.sid` in auth session setup.
6. No TLS runtime behavior change for LDAP/SMTP in this batch (documented risk acceptance).

## Implementation Plan

### 1) Invitation Feature Containment (future-item safe mode)
Goal: Remove active exposure from partially implemented invitation flows without finishing the feature yet.

Files:
- [server/config/env.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/config/env.ts)
- [server/routes/auth.routes.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/routes/auth.routes.ts)
- [server/routes/users.routes.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/routes/users.routes.ts)
- [server/utils/invitation.utils.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/utils/invitation.utils.ts)
- [client/src/features/settings/components/UsersSection.tsx](/Users/jonsteen/Documents/GitHub/OnBoardPro/client/src/features/settings/components/UsersSection.tsx)
- [client/src/app/auth/accept-invite/page.tsx](/Users/jonsteen/Documents/GitHub/OnBoardPro/client/src/app/auth/accept-invite/page.tsx)
- [client/src/App.tsx](/Users/jonsteen/Documents/GitHub/OnBoardPro/client/src/App.tsx) (only if route treatment needs adjustment)

Changes:
1. Add `ENABLE_INVITATIONS` env parsing and default false.
2. Add route guard helper in auth routes; invitation routes return `404` when feature off.
3. In users route, skip invitation merge logic when feature off.
4. Remove raw token/link logging in invitation utility; log only non-sensitive metadata.
5. Add client-side gating using `VITE_ENABLE_INVITATIONS`:
hide invite button/dialog and invitation-only controls when off.
6. Update accept-invite page to show explicit “invitation feature unavailable” message on 404.

Acceptance:
- Invitation endpoints are unreachable in default config.
- No raw invite token/link appears in logs.
- Admin settings UI no longer exposes invite workflows when feature is off.

### 2) Login IP / Proxy Hardening (SBP-005)
Goal: Use a single trusted IP resolution path for login throttling and remove direct header usage.

Files:
- [server/features/auth/services/auth.service.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/features/auth/services/auth.service.ts)
- [server/routes/auth.routes.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/routes/auth.routes.ts)
- [server/utils/ip-resolution.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/utils/ip-resolution.ts) (reuse only)
- [server/config/env.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/config/env.ts)

Changes:
1. Replace login path `req.ip` / `x-forwarded-for` extraction with `resolveClientIp(req)`.
2. Remove direct use of `x-forwarded-for` in login limiter calls.
3. Replace hardcoded `app.set("trust proxy", 1)` with env-driven trust config using `TRUSTED_PROXIES` (fallback false).

Acceptance:
- Login limiter keys are always derived from `resolveClientIp`.
- Proxy trust behavior is config-driven, not hardcoded.

### 3) CSP Tightening (SBP-006)
Goal: Remove production/test inline script allowance while preserving development ergonomics.

File:
- [server/index.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/index.ts)

Changes:
1. Set non-development `scriptSrc` to `["'self'"]`.
2. Keep development-only `unsafe-inline` and `unsafe-eval` for Vite HMR behavior.

Acceptance:
- CSP header no longer allows `'unsafe-inline'` in non-dev mode.
- App still functions in development.

### 4) Custom Session Cookie Name (SBP-007)
Goal: Eliminate default session cookie fingerprinting.

File:
- [server/features/auth/services/auth.service.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/features/auth/services/auth.service.ts)

Changes:
1. Add explicit `name: "obp.sid"` to session options.
2. Keep existing cookie security attributes unchanged.

Acceptance:
- Auth responses set `obp.sid` cookie with `HttpOnly` and existing scope attributes.

### 5) TLS Finding Risk Acceptance Record (SBP-003 per your decision)
Goal: Document accepted risk and operational guardrails without code-path hardening in this pass.

Files:
- [docs/WEB_APPLICATION_SECURITY_QUESTIONNAIRE.md](/Users/jonsteen/Documents/GitHub/OnBoardPro/docs/WEB_APPLICATION_SECURITY_QUESTIONNAIRE.md) or a new `docs/SECURITY_RISK_ACCEPTANCE.md`
- [security_best_practices_report.md](/Users/jonsteen/Documents/GitHub/OnBoardPro/security_best_practices_report.md)

Changes:
1. Add explicit risk acceptance entry for LDAP/SMTP cert validation behavior.
2. Record compensating controls, owner, and review date.
3. Mark SBP-003 as accepted/deferred in the report.

Acceptance:
- Risk acceptance is explicit, reviewable, and time-bounded.

## Test Cases and Scenarios

1. Backend invitation disablement tests:
`POST /api/invitations` returns 404 when `ENABLE_INVITATIONS=false`.
`DELETE /api/invitations/:id` returns 404 when disabled.
`POST /api/invitations/accept` returns 404 when disabled.

2. Backend users list behavior:
`GET /api/users` does not include `invite:*` pseudo-users when invitations disabled.

3. Auth/login IP hardening regression:
Existing auth login tests pass.
Add targeted test ensuring spoofed `x-forwarded-for` does not affect login limiter path when untrusted.

4. Session cookie test update:
In [server/tests/auth/authentication.test.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/tests/auth/authentication.test.ts), assert cookie name `obp.sid` and `HttpOnly`.

5. CSP verification:
Add/adjust test to assert CSP header exists and non-dev `script-src` excludes `'unsafe-inline'`.

6. Frontend invitation UI gating:
When `VITE_ENABLE_INVITATIONS` is false, invite controls do not render in Users settings.
Accept-invite page shows unavailable messaging on 404.

7. Full regression run:
`npm run test:backend`
`npm run test:frontend`

## Assumptions and Defaults
1. Invitation system is intentionally not production-ready and should be disabled by default now.
2. No key rotation is included in this batch (per your instruction).
3. TLS hardening code changes are intentionally deferred; risk is formally accepted and documented.
4. Token-at-rest migration for invitations is deferred until invitation feature implementation resumes.
5. Existing untracking/ignore work for secret env files remains in place.
