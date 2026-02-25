# Email System Overview

Last Updated: 2026-02-25

## Architecture

OnBoardPro email delivery is notification-driven and database-backed.

Flow summary:

1. Domain event fires (e.g. `task.assigned`, `comment.created`).
2. `notification-handler.ts` calls `createNotifications()` which:
   a. Loads recipient user preferences.
   b. Filters recipients (active, `notifyInApp`, event subscriptions, self-notification suppression, candidate visibility).
   c. Coalesces duplicate notifications within a 60-second window.
   d. Inserts in-app notification rows.
   e. Enqueues outbox entries for recipients with `notifyEmail: true`.
3. Background workers deliver immediate messages or digest batches.
4. Delivery state is persisted (`pending`, `retrying`, `sent`, `failed`, `digest_pending`).

This keeps request/response paths fast while preserving delivery reliability.

## Core Data Model

Defined in `shared/schemas/email.schema.ts` and related schemas.

- `notifications`: in-app notification records.
- `notification_keys`: dedupe keys for notification creation.
- `notification_outbox`: email-delivery queue for notifications.
- `smtp_settings`: encrypted SMTP configuration (includes rate limit columns).
- `user_preferences`: per-user notification, email, digest, quiet-hours, and event subscription preferences.

## Core Modules

### Notification Creation & Filtering

- `server/features/notifications/services/notify.ts`
- Responsibilities:
  - `createNotifications()`: central entry point for all notification creation
  - recipient preference loading and filtering (`filterRecipientsForNotification`)
  - self-notification suppression (when `actorId === recipientId` and `allowSelfNotifications` is off)
  - per-event-type subscription filtering (`eventSubscriptions`)
  - 60-second coalescing window to bump existing notifications instead of duplicating
  - outbox enqueue delegation to `enqueueNotificationEmails()`

### Notification Outbox

- `server/features/email/outbox.service.ts`
- Responsibilities:
  - enqueue immediate vs digest candidates (only for recipients with `notifyEmail: true`)
  - claim work with skip-locked SQL semantics
  - mark sent/failed/retry/quiet windows
  - reschedule digest processing

### SMTP Settings + Transport

- `server/features/email/smtp-settings.service.ts`
- Responsibilities:
  - load/update persisted SMTP settings
  - encrypt/decrypt SMTP credentials
  - validate settings and build nodemailer transport options
  - test-send functionality
  - admin-configurable rate limiting (`rateLimitPerMinute`, `rateLimitPerHour`)
  - TLS handling: `ignoreTLS` for `security=none`, `rejectUnauthorized: false` for TLS modes (supports internal relays with self-signed certs)

### Email Rendering

- `server/features/email/templates.ts`
- Responsibilities:
  - `renderImmediateEmail(notification)`
  - `renderDigestEmail(frequency, notifications)`
  - type-based subject/body generation for: `task.created`, `task.assigned`, `task.completed`, `comment.created`, `mention`, `stage.changed`, `candidate.template_applied`, `candidate.owner_changed`, `task.due_soon`, `task.overdue`

### Email Workers

- `server/jobs/notification-email.ts`
- Responsibilities:
  - immediate queue polling (30s interval, 20/batch)
  - hourly/daily digest windows
  - retry/backoff handling (exponential with jitter, max 5 retries)
  - quiet-hours deferral
  - SMTP rate limit enforcement before each send

### Rate Limiting

- `server/services/rate-limit.service.ts`
- Per-minute and per-hour SMTP send rate limits enforced by the email workers.
- Limits are admin-configurable via SMTP settings (`rateLimitPerMinute` default 30, `rateLimitPerHour` default 500).
- Backed by `rate_limit_counters` table with atomic UPSERT.

## Triggering and Event Integration

Notification generation and fanout are wired via:

- `server/events/EventBus.ts`
- `server/events/handlers/notification-handler.ts`
- `server/features/notifications/services/notify.ts` (`createNotifications`)

Handled event types:

- `task.created` — notify assignee
- `task.assigned` — notify assignee
- `task.completed` — notify candidate manager + followers
- `comment.created` — notify watchers
- `mention` — notify mentioned users
- `candidate.stage_changed` — notify candidate manager + followers
- `candidate.template_applied` — notify candidate manager

## User Preference Controls

Notification behavior is controlled by `user_preferences` (defined in `shared/preferences.ts`):

- `notifyInApp`: on/off in-app notification delivery (checked during recipient filtering)
- `notifyEmail`: on/off email delivery
- `digestFrequency`: `immediate`, `hourly`, `daily`
- `quietHoursStart` / `quietHoursEnd`: defer email delivery during quiet window
- `allowSelfNotifications`: global toggle — when off (default), suppresses notifications where the actor is the recipient (e.g. assigning a task to yourself)
- `eventSubscriptions`: per-event-type opt-in/out (`comment.created`, `task.assigned`, `stage.changed`, `mention`)

## SMTP Configuration Surface

Admin API routes in `server/routes/settings.routes.ts`:

- `GET /api/settings/email`
- `PATCH /api/settings/email`
- `POST /api/settings/email/test`

Only `system_admin` can update SMTP settings.

Configurable fields include: hostname, port, security mode (`none`, `starttls`, `ssl_tls`), auth type (`none`, `plain`, `login`, `cram_md5`, `xoauth2`), from name/email, rate limits.

## App Link Resolution in Emails

Links use `server/utils/app-url.ts` and resolve from the first configured value:

1. `APP_BASE_URL`
2. `PUBLIC_URL`
3. `CLIENT_URL`
4. `VITE_APP_URL`

Fallback: `http://localhost:5173`

## Operational Notes

- Job startup is controlled in `server/index.ts`.
- Disable email workers with `DISABLE_EMAIL_JOBS=1`.
- Outbox delivery updates `notifications.delivered_channels` to include `email`.
- Retries use exponential-style backoff with jitter (max 5 retries).
- Outbox `claimImmediateOutbox` uses explicit camelCase column aliases in RETURNING clause (raw SQL returns snake_case by default).
- SMTP transport is cached with a 5-minute TTL and signature-based invalidation.
