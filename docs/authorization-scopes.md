# Authorization Scope Tables

## Overview

Migration `0014_authorization_scopes.sql` introduces three join tables that express
department-, division-, and candidate-level visibility for staff and managers:

- `user_department_scopes` – departments a user can oversee.
- `user_division_scopes` – divisions a user can oversee.
- `manager_candidate_scopes` – candidate records directly assigned to a manager.

Each table enforces uniqueness on the `(user, scope)` pair and cascades deletes so
lingering grants are removed when users or resources are archived.

## Backfill Behavior

The migration copies current single-assignment columns into the new join tables:

- Any `users.department_id` becomes a `user_department_scopes` row.
- Any `users.division_id` becomes a `user_division_scopes` row.
- Any `candidates.manager_id` becomes a `manager_candidate_scopes` row.

This guarantees existing permissions remain intact while the application is refactored
to read from the new relations.

## Next Steps

1. Update session hydration to load scoped department/division IDs from the new tables.
2. Refactor query builders so candidate/task queries join against these scopes rather
   than relying on single columns.
3. Provide administrative tooling to manage scope assignments (add/remove departments,
   delegate divisions, etc.).

Until the refactor is complete the legacy `users.department_id` and `users.division_id`
columns remain authoritative, but any new assignments should also persist to the new
tables to avoid drift.
