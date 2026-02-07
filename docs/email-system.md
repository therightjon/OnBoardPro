# Email System Overview

## Table of Contents

- [Architecture](#architecture)
- [Key Components](#key-components)
  - [Schema](#1-schema-sharedschematts)
  - [Email Feature](#2-email-feature-serverfeaturesemail)
  - [Notification Preferences](#3-notification-preferences)
  - [Event-Driven Triggering](#4-event-driven-triggering-serverevents)
  - [Email Templates Detail](#5-email-templates-detail)
  - [Utility: App URLs](#6-utility-app-urls-serverutilsapp-urlts)
- [Data Flow](#data-flow)
- [Configuration](#configuration)
- [Key Design Decisions](#key-design-decisions)
- [Notifications vs. Email](#notifications-vs-email)

---

## Architecture

The email system follows an **outbox pattern** — notifications are persisted to the database, then processed asynchronously and delivered via email based on user preferences (immediate, hourly digest, daily digest, or weekly digest). This ensures reliability and decouples email sending from request handling.

## Key Components

### 1. Schema (`shared/schema.ts`)

The `emailOutbox` table stores pending/sent emails:

- `id`, `to`, `subject`, `htmlBody`, `textBody` — email content
- `status` — tracks state: `pending` → `sent` / `failed`
- `attempts`, `lastAttemptAt`, `lastError` — retry tracking
- `sentAt`, `createdAt` — timestamps
- `relatedEntityType`, `relatedEntityId` — links email to domain objects (e.g., a candidate or task)

User notification preferences are stored in the `notificationPreferences` table, controlling per-type delivery (`email_frequency`: `immediate`, `hourly`, `daily`, `weekly`, or `none`).

### 2. Email Feature (`server/features/email/`)

- **`templates.ts`** — Renders email content for both immediate and digest delivery. Key exports:
  - `renderImmediateEmail(notification)` — Generates subject/text/html for a single notification
  - `renderDigestEmail(frequency, items)` — Generates a grouped digest email for hourly/daily/weekly batches

  Internal helpers:
  - `summarizeNotification()` — Converts notification type + payload into human-readable subject and summary
  - `getCandidateName()` — Extracts candidate name from payload (supports `name`, `firstName`/`lastName`)
  - `formatTaskTitle()` — Extracts task title from payload
  - `buildNotificationLink()` — Constructs a deep link to a specific notification in the app
  - `toFrequencyLabel()` — Maps frequency string to display label

- **Email transport/sending** — Configured via environment variables for SMTP host, port, credentials, and sender address.

### 3. Notification Preferences

Users control how they receive email per notification type via `notificationPreferences`:

| Frequency   | Behavior                              |
|-------------|---------------------------------------|
| `immediate` | Email sent right away                 |
| `hourly`    | Batched into an hourly digest email   |
| `daily`     | Batched into a daily digest email     |
| `weekly`    | Batched into a weekly digest email    |
| `none`      | No email delivery                     |

### 4. Event-Driven Triggering (`server/events/`)

The **EventBus** connects domain events to notification creation:

```
Domain Action → Service publishes event → Event handler creates notification
  → Notification preferences checked → Email queued (immediate or digest)
```

Events include: `candidateCreated`, `taskAssigned`, `commentCreated`, `stageChanged`, `candidateOwnerChanged`, etc.

### 5. Email Templates Detail

The template system in `server/features/email/templates.ts` handles the following notification types:

| Notification Type          | Subject                                  | Summary                                      |
|----------------------------|------------------------------------------|----------------------------------------------|
| `comment.created`          | New comment on {candidate}               | Actor added a comment with preview           |
| `mention`                  | You were mentioned                       | Actor mentioned you in a comment             |
| `task.assigned`            | Task assigned: {title}                   | Actor assigned you a task                    |
| `task.due_soon`            | Task due soon: {title}                   | Task is coming due soon                      |
| `task.overdue`             | Task overdue: {title}                    | Task is overdue                              |
| `stage.changed`            | Stage update for {candidate}             | Candidate moved to new stage                 |
| `candidate.owner_changed`  | Ownership update for {candidate}         | Ownership has changed                        |
| *(default)*                | New notification                         | You have a new notification in OnBoardPro    |

All subjects are prefixed with `[OnBoardPro]`. Each email includes a deep link back to the notification via `buildAppUrl()`.

**Immediate emails** contain a single notification summary with a "View in OnBoardPro" link.

**Digest emails** contain a numbered list of notification summaries, each with its own link, plus a footer link to the full notifications page.

### 6. Utility: App URLs (`server/utils/app-url.ts`)

`buildAppUrl()` constructs absolute URLs for email links (e.g., `/notifications?focus={notificationId}`), ensuring links resolve correctly regardless of deployment environment.

## Data Flow

```
User Action (e.g., assign task)
  → Route Handler
    → Service (business logic)
      → EventBus.publish('taskAssigned', { ... })
        → Event Handler
          → Create notification in DB
          → Check user's notificationPreferences
          → If immediate: renderImmediateEmail() → INSERT into emailOutbox
          → If digest: notification waits for batch processing

Background Job (polling interval)
  → For digest frequencies (hourly/daily/weekly):
    → SELECT pending notifications for users with that frequency
    → renderDigestEmail(frequency, notifications)
    → INSERT into emailOutbox
  → SELECT FROM emailOutbox WHERE status = 'pending'
    → Send via SMTP transport
    → UPDATE emailOutbox SET status = 'sent' (or 'failed' with error)
```

## Configuration

Email is configured via environment variables:

| Variable                     | Purpose                                      |
|------------------------------|----------------------------------------------|
| `SMTP_HOST`                  | SMTP server hostname                         |
| `SMTP_PORT`                  | SMTP server port                             |
| `SMTP_USER`                  | SMTP authentication username                 |
| `SMTP_PASS`                  | SMTP authentication password                 |
| `EMAIL_FROM` / `SMTP_FROM`   | Default sender address                       |
| `APP_URL` / `BASE_URL`       | Used by `buildAppUrl()` for email links      |

## Key Design Decisions

| Decision                   | Rationale                                                                 |
|----------------------------|---------------------------------------------------------------------------|
| **Outbox pattern**         | Guarantees no email loss; can retry on transient failures                 |
| **Event-driven**           | Decouples email logic from business logic; easy to add new email triggers |
| **Database-backed queue**  | No external message broker needed; uses existing PostgreSQL               |
| **Template functions**     | Type-safe templates that receive notification data; easy to test/extend   |
| **Retry with tracking**    | `attempts` + `lastError` tracking for operational visibility              |
| **Digest support**         | Users control email volume with hourly/daily/weekly batching              |
| **Feature-based folder**   | Email code lives in `server/features/email/`, following project convention |

## Notifications vs. Email

The notification system and email system are complementary:

- **In-app notifications** are stored in the `notifications` table and delivered via UI polling
- **Email notifications** go through the outbox for external delivery
- Both are triggered by the same domain events, with user preferences determining delivery channel and frequency
