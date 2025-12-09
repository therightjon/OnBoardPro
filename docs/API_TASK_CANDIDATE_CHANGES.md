# Test Remediation Notes: Candidate & Task APIs (Phases 1–3)

## Current Behavior (matches tests)
- **Candidates**
  - Creation: rejects unknown department/division; requires `letterOfIntentDate` & `templateId`; duplicate email returns 400.
  - Listing: supports `departmentId`, `divisionId`, `managerId`, `search`, `sortBy=lastName`, `sortOrder`, `limit`, `offset`; non-privileged users get scoped results.
  - Updates: allows `phoneNumber`; rejects duplicate email; validates status against allowed set; department/division scopes enforced for admin roles.
  - Delete: archives by default; 404 when outside scope; works with mock hard-delete.
  - Status endpoint: validates status enum and returns 400 on invalid values.
- **Tasks**
  - Status aliases: input `pending/completed` map to internal `todo/done`; responses include aliases and `dueDate`.
  - Creation: hr/system only; validates candidate existence; accepts `dueDate`; defaults priority/category/stage when absent; rejects invalid status.
  - Listing: optional filters (`candidateId`, `assigneeUserId`, `status`, `overdue`, `dueSoon`); supports `sortBy=dueDate|status`, `sortOrder`, `limit`, `offset`; privileged users can list without candidate/assignee; non-privileged sanitized.
  - Updates: accepts `dueDate`; status validation; response returns flattened task with `status` alias and `dueDate`.
  - Delete: hr/system/department/division only; responds 200 with `{ deleted: true }`; managers blocked.
  - Bulk update: `POST /api/tasks/bulk-update` with `taskIds[]` and `updates` (`status`, `assigneeUserId`, `dueDate`) returns `{ updated }`.
  - Deadline filters: `overdue=true` (past due, not done/canceled) and `dueSoon=true` (next 7 days).

## Optional Improvements / Follow-ups
1) **API surface documentation**
   - Publish the status alias behavior (`pending`↔`todo`, `completed`↔`done`) and `dueDate` vs `dueAt` mapping for clients.
   - Document new bulk-update endpoint and deadline filters (`overdue`, `dueSoon`) in API docs/Swagger.
2) **Role/permission clarity**
   - Confirm product intent for department/division admins on task deletes and candidate deletes vs. stricter hr/system-only behavior.
3) **Data model consistency**
   - Consider normalizing stored status to aliases or exposing both `status` and `statusInternal` to reduce confusion.
4) **Test-fixture hygiene**
   - Keep fixture emails and departments aligned with production constraints to avoid silent divergence.
5) **Logging/noise reduction**
   - Remove or gate debug logs around template auto-apply (`Checking LOO acceptance auto-apply`) once not needed.

## Verification
- Focused: `NODE_ENV=test SKIP_AUTH_SETUP=1 npx tsx --test server/tests/routes/tasks.test.ts`
- Full: `npm run test` (all backend + frontend) – passing. 
