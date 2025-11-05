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

- Provide administrative tooling to manage scope assignments (add/remove departments,
  delegate divisions, etc.).
- Finish migrating administrative endpoints (templates, settings, comments) to the
  shared authorization helpers and maintain consistent 403/404 handling.
- Expand automated tests and documentation for multi-role scope enforcement, including
  regression coverage for candidate/task visibility.
