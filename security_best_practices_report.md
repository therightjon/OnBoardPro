# Security Best Practices Assessment Report

Date: 2026-02-27
Project: OnBoardPro
Assessment type: Source-code security review + dependency audit (no live external exploitation attempted)

## Executive Summary
The codebase has strong foundational controls (session auth, CSRF middleware, role checks, and rate limiting), but there are several high-impact gaps that should be addressed before production hardening is considered complete.

Most urgent issues are:
1. Real credentials/secrets committed in tracked files.
2. Invitation links with live tokens logged in plaintext.
3. TLS certificate validation disabled for LDAP StartTLS and SMTP TLS paths.

These issues materially increase risk of account compromise, credential interception, and environment takeover if logs/repo/network are exposed.

## Scope and Method
- Reviewed server/client TypeScript code paths for auth/session/CSRF/authorization/input handling/secrets.
- Reviewed infra/env files for credential handling.
- Ran dependency audit:
  - `npm audit --omit=dev --json` (production deps): 0 vulnerabilities
  - `npm audit --json` (all deps): low-severity transitive issues in non-prod dependency graph

## Findings

### Critical

#### SBP-001: Hardcoded secrets/credentials are committed to tracked files
Impact: An attacker with repository access can reuse secrets to access infrastructure, forge sessions, or laterally move into other systems.

Evidence:
- [.env](/Users/jonsteen/Documents/GitHub/OnBoardPro/.env:2)
- [.env](/Users/jonsteen/Documents/GitHub/OnBoardPro/.env:4)
- [.env](/Users/jonsteen/Documents/GitHub/OnBoardPro/.env:43)
- [scripts/azure/vars.env](/Users/jonsteen/Documents/GitHub/OnBoardPro/scripts/azure/vars.env:11)
- [scripts/azure/vars.env](/Users/jonsteen/Documents/GitHub/OnBoardPro/scripts/azure/vars.env:61)
- [scripts/azure/container/vars.env](/Users/jonsteen/Documents/GitHub/OnBoardPro/scripts/azure/container/vars.env:32)
- [scripts/azure/container/vars.env](/Users/jonsteen/Documents/GitHub/OnBoardPro/scripts/azure/container/vars.env:42)

Notes:
- `.env` is listed in `.gitignore`, but is currently tracked in git (`git ls-files .env`).

Recommended fix:
- Rotate all exposed credentials/secrets immediately.
- Remove secrets from tracked files and keep only placeholders.
- Move secrets to a managed secret store (Azure Key Vault / CI secret manager).
- Purge historical secrets from git history if repository exposure is possible.

### High

#### SBP-002: Invitation tokens are logged in plaintext
Impact: Anyone with log access can hijack pending invitation links and register unauthorized accounts.

Evidence:
- [server/utils/invitation.utils.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/utils/invitation.utils.ts:37)

Recommended fix:
- Never log raw invitation links/tokens.
- Log invitation ID + recipient only, or token hash prefix for troubleshooting.

#### SBP-003: TLS certificate validation is disabled on secure transport paths
Impact: Attackers on-path can perform MITM attacks to capture credentials and sensitive content.

Evidence:
- LDAP StartTLS path disables cert validation:
  - [server/features/auth/services/providers.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/features/auth/services/providers.ts:195)
- SMTP TLS path disables cert validation:
  - [server/features/email/smtp-settings.service.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/features/email/smtp-settings.service.ts:289)
- LDAP test endpoint also disables cert validation:
  - [server/routes/auth.routes.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/routes/auth.routes.ts:732)

Recommended fix:
- Set `rejectUnauthorized: true` for production.
- If internal CA is required, provide CA bundle/pinning config instead of globally disabling verification.
- Gate insecure mode behind explicit non-production flag.

### Medium

#### SBP-004: Invitation tokens are stored and queried as plaintext in the database
Impact: Read-only DB compromise enables replay/use of unexpired invitations.

Evidence:
- Invitation schema stores token as `text`:
  - [shared/schemas/auth.schema.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/shared/schemas/auth.schema.ts:156)
- Repository persists and queries raw tokens:
  - [server/repositories/users/InvitationRepository.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/repositories/users/InvitationRepository.ts:70)
  - [server/repositories/users/InvitationRepository.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/repositories/users/InvitationRepository.ts:92)
  - [server/repositories/users/InvitationRepository.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/repositories/users/InvitationRepository.ts:117)

Recommended fix:
- Store only a salted/peppered hash of invitation token.
- Compare incoming token by hashing and matching hash index.
- Keep short expiration and one-time consumption semantics (already present).

#### SBP-005: Login IP throttling can be weakened by proxy/IP trust inconsistencies
Impact: Per-IP brute-force throttling may be bypassed or degraded under proxy misconfiguration/spoofed forwarding headers.

Evidence:
- Direct use of `req.ip` / `x-forwarded-for` in login limiter inputs:
  - [server/features/auth/services/auth.service.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/features/auth/services/auth.service.ts:162)
  - [server/routes/auth.routes.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/routes/auth.routes.ts:52)
- App trusts proxy hop count statically:
  - [server/features/auth/services/auth.service.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/features/auth/services/auth.service.ts:110)

Recommended fix:
- Use a single hardened resolver (`resolveClientIp`) for all auth and rate-limit paths.
- Configure `trust proxy` via explicit trusted proxy list, not hardcoded `1`.
- Avoid directly consuming `x-forwarded-for` in route handlers.

### Low

#### SBP-006: CSP allows `unsafe-inline` for scripts in production
Impact: Weakens defense-in-depth against XSS.

Evidence:
- [server/index.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/index.ts:28)

Recommended fix:
- Remove `unsafe-inline` for production scripts.
- Prefer nonce/hash-based allowances for required inline scripts.

#### SBP-007: Session cookie name is left as framework default
Impact: Minor fingerprinting risk and does not follow best-practice hardening.

Evidence:
- Session config lacks explicit `name` override:
  - [server/features/auth/services/auth.service.ts](/Users/jonsteen/Documents/GitHub/OnBoardPro/server/features/auth/services/auth.service.ts:92)

Recommended fix:
- Set a custom, non-default session cookie name.

## Positive Controls Observed
- CSRF protection middleware for state-changing API requests.
- Session fixation mitigation via session regeneration during login.
- Role-based authorization middleware and policy service.
- Rate limiting framework present for default/sensitive endpoints.
- Production dependency audit (`--omit=dev`) currently clean.

## Prioritized Remediation Plan
1. Emergency secret rotation and secret removal from repository (SBP-001).
2. Remove token/link logging and deploy (SBP-002).
3. Enforce TLS cert validation defaults; add safe CA configuration path (SBP-003).
4. Migrate invitation tokens to hashed-at-rest model (SBP-004).
5. Unify and harden client IP/proxy trust handling for login throttling (SBP-005).
6. Apply low-risk hardening items (SBP-006, SBP-007).

