# Email System Overview

Last Updated: 2026-02-18

## Architecture

OnBoardPro email delivery is notification-driven and database-backed.

Flow summary:

1. Domain event produces in-app notifications.
2. Eligible notifications are queued in `notification_outbox`.
3. Background workers deliver immediate messages or digest batches.
4. Delivery state is persisted (`pending`, `retrying`, `sent`, `failed`, `digest_pending`).

This keeps request/response paths fast while preserving delivery reliability.

## Core Data Model

Defined in `shared/schemas/email.schema.ts` and related schemas.

- `notifications`: in-app notification records.
- `notification_keys`: dedupe keys for notification creation.
- `notification_outbox`: email-delivery queue for notifications.
- `smtp_settings`: encrypted SMTP configuration.
- `user_preferences`: per-user email + digest + quiet-hours preferences.

## Core Modules

### Notification Outbox

- `server/features/email/outbox.service.ts`
- Responsibilities:
  - enqueue immediate vs digest candidates
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

### Email Rendering

- `server/features/email/templates.ts`
- Responsibilities:
  - `renderImmediateEmail(notification)`
  - `renderDigestEmail(frequency, notifications)`
  - type-based subject/body generation

### Email Workers

- `server/jobs/notification-email.ts`
- Responsibilities:
  - immediate queue polling
  - hourly/daily/weekly digest windows
  - retry/backoff handling
  - quiet-hours deferral

## Triggering and Event Integration

Notification generation and fanout are wired via:

- `server/events/EventBus.ts`
- `server/events/handlers/notification-handler.ts`
- notification creation utilities in `server/features/notifications/services/`

Common sources:

- task assignment/completion
- comment creation and mentions
- stage changes
- ownership/template transitions

## User Preference Controls

Email behavior is controlled by `user_preferences`:

- `notifyEmail`: on/off email delivery
- `digestFrequency`: `immediate`, `hourly`, `daily`, `weekly`, `none`
- `quietHoursStart` / `quietHoursEnd`: defer delivery during quiet window

## SMTP Configuration Surface

Admin API routes in `server/routes/settings.routes.ts`:

- `GET /api/settings/email`
- `PATCH /api/settings/email`
- `POST /api/settings/email/test`

Only `system_admin` can update SMTP settings.

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
- Retries use exponential-style backoff with jitter.
