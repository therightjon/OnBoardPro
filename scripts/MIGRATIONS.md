# Migrations workflow

This document explains how to add, test, and roll back SQL migrations for OnBoardPro.

## Adding a migration

1) Create a new SQL migration file in the `migrations/` directory. Name it using the pattern `NNNN_description.sql` where `NNNN` is a zero-padded incremental number. Example: `0019_add_index_to_users.sql`.

2) Write SQL statements for the migration ensuring they are idempotent or use `BEGIN`/`COMMIT` wrapping when applying.

3) If the change requires Drizzle schema updates, update `shared/schema.ts` and any associated TypeScript types, then run `npm run db:push` to apply any Drizzle migrations.

4) Test locally by applying the migration to a local Postgres (or a Docker container using `docker-compose up db`) and verifying app behavior.

## Applying migrations manually

- Apply a single migration file using the `runMigration.ts` script (runs the SQL inside a transaction):

```bash
npx tsx scripts/runMigration.ts migrations/0019_add_index_to_users.sql

You can also use `npm run db:migrate-file` npm script which calls `npx tsx scripts/runMigration.ts`:

```bash
npm run db:migrate-file -- migrations/0019_add_index_to_users.sql
```
```

- Apply multiple SQL files in sequence using `runSqlFiles.ts` (runs each file under its own transaction):

```bash
npx tsx scripts/runSqlFiles.ts migrations/0001_initial.sql migrations/0002_prior_stage_blocking.sql
```

- You can also use `npm run db:run-sql` which calls the TypeScript script via `npx tsx`:

```bash
npm run db:run-sql -- migrations/0001_initial.sql migrations/0002_prior_stage_blocking.sql

If you'd like to apply a single file through `npm` you can use the `db:migrate-file` helper, as shown above.
```

## Rolling back

- Rollbacks are manual; SQL migrations are irreversible by default unless you explicitly write a down script. To undo a migration:
  1. Prepare a new migration file to revert the changes made by the previous migration (following the file naming rule). Example: `0020_revert_add_index_to_users.sql`.
  2. Apply the revert migration using the same scripts above.

- If you need to revert a change in a hurry for a critical issue, restore a DB backup (e.g., `pg_restore` or `pg_dump`) made before the migration.

## Best practices

- Keep migrations small, focused, and reversible where possible.
- Test schema changes locally before deploying to production.
- Apply migrations using CI/CD with appropriate DB backups and maintenance windows for production environments.

## Troubleshooting

- If you see `DATABASE_URL is not set` ensure your `.env` file is present or provide `DATABASE_URL` inline.
- If connecting to Neon, SSL is auto-enabled by detecting the `neon.tech` hostname.
- If a migration fails, `runSqlFiles.ts` will rollback the current file and stop; inspect the error and re-run after fixing.
