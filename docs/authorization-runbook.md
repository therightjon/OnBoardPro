# Authorization Runbook

This runbook captures the operational checklist for authorization changes,
monitoring, and manual validation workflows. Keep it current with every update
to auth logic, metrics integrations, or rate limiting guardrails.

## Quick Links

- Permission Matrix: `docs/permission-matrix.md`
- Automated Tests: `npm run test:auth`
- Metrics Reporter: `server/observability/authMetrics.ts`

## Monitoring & Metrics

- `logAuthorizationFailure` now emits structured events via
  `reportAuthorizationFailure`. Production deployments should provide a
  reporter that forwards events to the metrics stack (e.g., StatsD/Prometheus).
  ```ts
  import { setAuthorizationMetricsReporter } from "server/observability/authMetrics";

  setAuthorizationMetricsReporter((event) => {
    statsd.increment(`auth.denied`, 1, {
      resource: event.resource,
      action: event.action,
      reason: event.reason,
    });
  });
  ```
- Temporary visibility is available by setting `AUTH_METRICS_STDOUT=1`, which
  writes a one-line JSON payload for each denial.
- Tests skip audit-log writes by default while still exercising metrics via the
  reporter. To re-enable full logging within tests set `ENABLE_AUTH_AUDIT_IN_TESTS=1`.

## Rate Limiting Configuration

The following environment variables govern builtin rate limit buckets (see
`server/routes.ts`):

| Variable | Default | Description |
| --- | --- | --- |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Default bucket duration in milliseconds |
| `RATE_LIMIT_MAX` | `120` | Requests allowed per window for non-sensitive routes |
| `SENSITIVE_RATE_LIMIT_WINDOW_MS` | inherits default | Candidate/task sensitive routes window |
| `SENSITIVE_RATE_LIMIT_MAX` | `60` | Requests allowed per window for sensitive routes |
| `ADMIN_RATE_LIMIT_WINDOW_MS` | inherits default | Administrative endpoints window |
| `ADMIN_RATE_LIMIT_MAX` | `30` | Requests allowed per window for administrative endpoints |

Adjust values with caution and document rationale alongside the change.

## Manual & Penetration Testing Checklist

| Scenario | Procedure | Status | Notes |
| --- | --- | --- | --- |
| Cross-scope candidate access | Attempt to pull `/api/candidates/:id` outside permitted department/division, confirm 404 + audit metric | Pending | Mirror findings into automated tests where possible |
| Candidate self-view minimization | Use candidate account to enumerate tasks/comments ensuring sanitized fields | Pending | Covered partially by `candidate task detail is sanitized` test |
| Rate limiting resilience | Simulate burst traffic per endpoint category, ensure 429 and metric emission | Pending | Tune thresholds if frequent false positives observed |
| Settings secrets masking | Exercise settings/LDAP APIs, confirm masked secrets and denied retrieval attempts | Pending | Add regression tests before release |

Record outcomes here during each manual/pen-test cycle and convert any
regressions into automated tests under `server/tests/auth`.

## Adding New Endpoints Checklist

1. Guard with `requireAuth` and the appropriate `requireRole` (or scoped helper).
2. Fetch data through `storage.buildAuthorizationContext` powered helpers to
   enforce scope filters uniformly.
3. Sanitize response payloads for non-privileged roles (reuse
   `sanitizeCandidateForCandidateUser`/`sanitizeTaskForCandidateUser` patterns).
4. Add a row to `docs/permission-matrix.md` describing roles, scopes, exposed
   fields, and automated coverage.
5. Extend `server/tests/auth` with regression tests covering positive and
   negative flows for each new role/scope combination.
6. Update this runbook if new metrics or operational knobs are introduced.
