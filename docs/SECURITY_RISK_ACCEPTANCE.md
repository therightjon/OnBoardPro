# Security Risk Acceptance Register

## SBP-003: TLS certificate validation disabled on LDAP/SMTP paths

- Risk ID: `SBP-003`
- Date accepted: `2026-02-27`
- Accepted by: `OnBoardPro system owner`
- Owner: `Platform/Operations`
- Status: `Accepted (time-bounded)`
- Review date: `2026-05-31`

### Scope

- LDAP StartTLS test/auth flows currently allow insecure TLS certificate validation behavior.
- SMTP TLS path currently allows insecure TLS certificate validation behavior.

### Reason for acceptance

- The invitation/auth hardening batch is prioritized for immediate exposure reduction.
- TLS behavior changes can affect production connectivity and require coordinated certificate/CA rollout.
- This risk is temporarily accepted pending a dedicated TLS hardening change set.

### Compensating controls

- Internal-network-only deployment boundary.
- Restricted administrative access and audited configuration changes.
- Existing rate limiting, session controls, and auth logging.
- Security review follow-up scheduled for targeted TLS remediation.

### Exit criteria

- Replace insecure TLS behavior with certificate verification by default.
- Add CA bundle configuration path for private/internal PKI.
- Re-test LDAP and SMTP connectivity in non-production and production.
