# Migrations Workflow

How to add and apply SQL migrations in OnBoardPro.

Last Updated: 2026-02-18

## Source of Truth

- Drizzle schema input: `shared/schemas/*.ts` (see `drizzle.config.ts`)
- SQL migrations output folder: `migrations/`
- Manual SQL runners:
  - `scripts/runMigration.ts` (single file, transaction-wrapped)
  - `scripts/runSqlFiles.ts` (multiple files, each in its own transaction)

## Current Migration Range

As of this update, the repository includes migrations:

- `0001_initial.sql`
- ...
- `0024_template_task_order.sql`

Create new files using the next numeric prefix, for example `0025_<description>.sql`.

## Adding a Migration

1. Add a new SQL file under `migrations/` with the next sequence number.
2. Keep migrations focused and safe to run once.
3. If schema changes are reflected in TypeScript models, update `shared/schemas/*.ts`.
4. Validate locally against Postgres before merging.

## Applying Migrations

### Option A: Drizzle Push

```bash
npm run db:push
```

### Option B: Run a Single SQL File

```bash
npx tsx scripts/runMigration.ts migrations/0025_example.sql
# or
npm run db:migrate-file -- migrations/0025_example.sql
```

### Option C: Run Multiple SQL Files

```bash
npx tsx scripts/runSqlFiles.ts migrations/0023_loo_issued_accepted_rules.sql migrations/0024_template_task_order.sql
# or
npm run db:run-sql -- migrations/0023_loo_issued_accepted_rules.sql migrations/0024_template_task_order.sql
```

## Environment Requirements

- `DATABASE_URL` must be set.
- Both scripts load `.env` automatically.
- `runMigration.ts` auto-enables SSL for Neon hosts (`*.neon.tech`).

## Rollback Strategy

This project uses forward-only migrations by default.

If a change must be undone:

1. Create a new migration that reverses the previous change.
2. Apply it with the same migration process.

For emergency rollback in production, restore from backup/snapshot.

## Troubleshooting

- `DATABASE_URL is not set`: create/fix `.env`.
- SQL file not found: verify path passed to the script.
- Migration failed mid-file: transaction rollback occurs automatically for that file.
- Multi-file run stopped: fix failing file and rerun remaining files.
