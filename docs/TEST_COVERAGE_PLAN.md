# Test Coverage Plan - Priority 2.3

**Status:** In Progress
**Target:** 80% unit test coverage, 60% integration coverage
**Current:** <5% coverage (estimated)

---

## Overview

This document outlines the comprehensive test coverage plan for the refactored Priority 1 architecture (repositories, services, and routes).

## Test Strategy

### 1. Unit Tests
- **Target:** 85% coverage for repositories, 80% for services
- **Framework:** Node.js built-in test runner (`node:test`)
- **Assertions:** Node.js built-in `assert/strict`
- **Mocking:** `InMemoryStorage` for database operations

### 2. Integration Tests
- **Target:** 75% coverage for routes
- **Framework:** Node.js test runner + Supertest
- **Database:** `InMemoryStorage` for isolated testing
- **Authentication:** Mock sessions via `testAgent`

### 3. E2E Tests
- **Target:** 100% coverage of critical paths
- **Scope:** User workflows (create candidate, apply template, complete tasks)

---

## Test Coverage Breakdown

### Phase 1: Repository Tests (85% target)

#### Simple Repositories ✅ STARTED
- [x] `HiringStageRepository` - Needs fixing (mock issues)
- [x] `TaskDefinitionRepository` - Needs fixing (mock issues)
- [ ] `TaskCategoryRepository`
- [ ] `ReferenceDataRepository`

#### Organizational Repositories
- [ ] `DepartmentRepository`
- [ ] `DivisionRepository`

#### User Repositories
- [ ] `UserRepository` - Critical for CRUD + roles
- [ ] `UserIdentityRepository` - Multi-provider auth
- [ ] `UserPreferencesRepository`
- [ ] `InvitationRepository`

#### Template Repositories
- [ ] `TemplateRepository` - Including clone logic
- [ ] `TemplateTaskRepository`
- [ ] `TemplateStageRepository` - Including reordering

#### Candidate Repositories (Most Complex)
- [ ] `CandidateRepository` - Status transitions, authorization
- [ ] `CandidateTaskRepository`
- [ ] `CandidateStageRepository`
- [ ] `CandidateFollowerRepository`

#### Standalone Repositories
- [x] `NotificationRepository` - Needs fixing (mock issues)
- [ ] `CommentRepository`
- [ ] `SearchRepository` - Trigram search logic

### Phase 2: Service Tests (80% target)

#### Template Services
- [ ] `TemplateExpansionService` - 7-phase orchestration
  - Validation phase
  - Data retrieval phase
  - Anchor resolution
  - Task creation
  - Stage snapshots
  - Candidate updates
  - History recording
- [ ] `TemplateEstimationService` - Timeline calculations
  - Template estimation
  - Candidate estimation
  - Business day calculations

#### Task Services
- [x] `TaskDueDateService` ✅ STARTED (6/7 tests passing)
  - Due date recalculation
  - Anchor date handling
  - Pending anchor logic
  - All rule types (LOO, start, fixed)

### Phase 3: Route Integration Tests (75% target)

#### Simple Routes
- [ ] `reference-data.routes` (11 routes)
- [ ] `organizations.routes` (10 routes)
- [ ] `settings.routes` (5 routes)
- [ ] `search.routes` (4 routes)

#### Medium Routes
- [ ] `users.routes` (12 routes)
- [ ] `auth.routes` (7 routes)

#### Complex Routes
- [ ] `notifications.routes` (5 routes)
- [ ] `templates.routes` (18 routes)
- [ ] `tasks.routes` (9 routes)
- [ ] `candidates.routes` (14 routes)

---

## Test Patterns

### Repository Test Pattern

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { createAuthTestEnvironment } from "../utils/testEnvironment";
import { Repository } from "../../repositories/path/Repository";
import { randomUUID } from "node:crypto";

test("Repository: operation description", async (t) => {
  const env = await createAuthTestEnvironment();
  const resetStorage = env.useAsGlobalStorage();

  // Create repository instance with real db connection
  const repository = new Repository(db);

  // Seed test data using env.storage helper methods
  env.storage.upsertDepartment({
    id: randomUUID(),
    name: "Engineering",
    // ...
  });

  // Test repository operations
  const result = await repository.someMethod();

  // Assertions
  assert.ok(result);
  assert.equal(result.name, "Engineering");

  // Cleanup
  t.after(async () => {
    resetStorage();
    await env.dispose();
  });
});
```

### Service Test Pattern

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { Service } from "../../services/path/Service";

test("Service: business logic description", async () => {
  // Mock dependencies
  const mockDb = createMockDb();
  const mockRepository = {
    getSomething: async (id: string) => ({ id, name: "Test" })
  };

  const service = new Service(mockDb, mockRepository);

  const result = await service.performAction("test-id");

  assert.ok(result.success);
  assert.equal(result.itemsProcessed, 1);
});
```

### Route Integration Test Pattern

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createAuthTestEnvironment } from "../utils/testEnvironment";
import { seedAuthorizationFixtures } from "../utils/seedAuthorizationFixtures";
import { buildUserSessionPayload } from "../utils/testAgent";

test("GET /api/endpoint returns data for authorized user", async (t) => {
  const env = await createAuthTestEnvironment();
  const resetStorage = env.useAsGlobalStorage();

  const fixtures = await seedAuthorizationFixtures(env.storage);
  const session = await buildUserSessionPayload(env.storage, fixtures.users.hrStaff);

  // Make authenticated request
  const response = await request(app)
    .get("/api/endpoint")
    .set("Cookie", `sessionId=${session.id}`)
    .expect(200);

  assert.ok(Array.isArray(response.body));
  assert.ok(response.body.length > 0);

  t.after(async () => {
    resetStorage();
    await env.dispose();
  });
});
```

---

## Key Test Scenarios

### Repository Tests Must Cover

1. **CRUD Operations**
   - Create with valid data
   - Read by ID
   - Update existing record
   - Delete/Archive

2. **Authorization**
   - Scoped queries (department, division, manager)
   - Privileged vs non-privileged access
   - Candidate visibility rules

3. **Business Rules**
   - Required field validation
   - State transitions
   - Cascading updates
   - Referential integrity

4. **Edge Cases**
   - Null/undefined handling
   - Empty result sets
   - Duplicate operations
   - Concurrent modifications

### Service Tests Must Cover

1. **Core Business Logic**
   - Happy path scenarios
   - Complex orchestration flows
   - Multi-step transactions

2. **Error Handling**
   - Missing required data
   - Invalid state transitions
   - External dependency failures

3. **Edge Cases**
   - Boundary conditions
   - Race conditions
   - Idempotency

### Route Tests Must Cover

1. **Authentication**
   - Unauthenticated requests (401)
   - Authenticated requests (200)

2. **Authorization**
   - Role-based access (system_admin, hr_staff, manager, candidate)
   - Scope-based filtering
   - Forbidden access (403)

3. **Input Validation**
   - Valid input (200)
   - Invalid input (400)
   - Missing required fields (400)

4. **Business Logic Integration**
   - Creates trigger notifications
   - Updates cascade correctly
   - State machines enforced

---

## Test Files Created

### ✅ Completed (Needs Fixes)
1. `server/tests/services/task-due-date.service.test.ts` - 7 tests (6 passing)
2. `server/tests/repositories/HiringStageRepository.test.ts` - 7 tests (mock issues)
3. `server/tests/repositories/TaskDefinitionRepository.test.ts` - 8 tests (mock issues)
4. `server/tests/repositories/NotificationRepository.test.ts` - 10 tests (mock issues)

### 🔄 In Progress
- Fixing mock database implementations
- Switching to InMemoryStorage pattern

### ⏳ Pending
- 20+ repository test files
- 2 service test files
- 10 route integration test files

---

## Known Issues

### Mock Database Problems

The initial test files used custom mock databases that don't properly simulate Drizzle ORM behavior:

1. **Circular reference in `from()` method** - Causes stack overflow
2. **Incomplete method chaining** - Missing `.where().orderBy()` support
3. **Transaction simulation** - Doesn't properly handle rollbacks

**Resolution:** Switch to using `InMemoryStorage` which already implements the full `IStorage` interface and is battle-tested in existing authorization tests.

### Test Execution Issues

1. One existing test file (`api/integration.test.ts`) imports `vitest` which is not installed
2. Need to exclude or fix this file for full test suite execution

---

## Next Steps

### Immediate (Today)
1. ✅ Create this test coverage plan document
2. Fix existing test files to use InMemoryStorage pattern
3. Create 2-3 working repository test examples
4. Create 1 working service test example
5. Commit and push initial test infrastructure

### Short-term (This Week)
1. Complete all repository tests (27 files)
2. Complete all service tests (3 files)
3. Add route integration tests (10 files)
4. Measure actual code coverage with c8 or nyc
5. Address gaps to reach 80% target

### Long-term (Optional)
1. Add E2E tests for critical user workflows
2. Add performance/load tests
3. Add database migration tests
4. Set up CI/CD pipeline with test automation
5. Add code coverage reporting to PRs

---

## Test Coverage Targets

| Component | Files | Tests Needed | Current | Target | Priority |
|-----------|-------|--------------|---------|--------|----------|
| **Repositories** | 27 | ~270 | ~30 | 85% | High |
| **Services** | 3 | ~30 | ~7 | 80% | High |
| **Routes** | 10 | ~100 | ~12 | 75% | Medium |
| **Utilities** | 8 | ~80 | ~15 | 80% | Medium |
| **Total** | **48** | **~480** | **~64** | **80%** | **High** |

---

## Success Criteria

- [ ] All repository tests pass (270+ tests)
- [ ] All service tests pass (30+ tests)
- [ ] All route integration tests pass (100+ tests)
- [ ] Code coverage measured and reported
- [ ] Overall coverage ≥ 80%
- [ ] No flaky tests
- [ ] Tests run in < 60 seconds
- [ ] CI/CD integration complete

---

**Last Updated:** 2025-11-19
**Author:** Priority 2 Refactoring Team
**Status:** In Progress
