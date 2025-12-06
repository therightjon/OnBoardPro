# Test Update Report: Storage Refactor Impact Analysis

**Generated:** December 6, 2025  
**Repository:** OnBoardPro (dev branch)  
**Analysis Based On:** Refactoring plans from Dec 5-6 (yesterday)  
**Total Tests Affected:** 62+ failures

---

## Executive Summary

You completed a **major architectural refactor** to decompose `storage.ts` (3,744 LOC) into a modular service layer with 27 repositories and 30+ services. While the **routes have been successfully migrated** to use the new service architecture, **the test infrastructure has NOT been updated** to match this new architecture.

**Key Finding:** Tests are failing because they expect the old `InMemoryStorage` mock pattern, but the new architecture uses `MockServiceFactory` instead. Additionally, several services/repositories haven't had their test fixtures properly configured.

---

## Refactoring Changes Summary

### What Changed (Yesterday)

#### ✅ Routes: **100% Migrated**
All 10 route modules now use service layer instead of `storage.ts` directly:
- `candidates.routes.ts` → Uses `CandidateService` 
- `tasks.routes.ts` → Uses `TaskService`
- `templates.routes.ts` → Uses `TemplateService`
- `users.routes.ts` → Uses `UserService`
- `organizations.routes.ts` → Uses `DepartmentService`/`DivisionService`
- `auth.routes.ts` → Uses `AuthenticationService`/`UserInvitationService`
- `notifications.routes.ts` → Uses `NotificationService`
- `search.routes.ts` → Uses `SearchService`
- `reference-data.routes.ts` → Uses `ReferenceDataService`
- `settings.routes.ts` → Uses `SystemSettingsService`

#### ✅ Services: **30+ Created**
Complete service layer with proper separation of concerns:
- `CandidateService`
- `TaskService`
- `TemplateService`
- `TemplateExpansionService` (396 LOC)
- `TemplateEstimationService`
- `TaskDueDateService`
- `UserService`
- `AuthorizationService`
- `NotificationService`
- `UserInvitationService`
- `CandidateStatusService`
- `CommentService`
- `SearchService`
- And 17+ more...

#### ✅ Repositories: **27 Created**
Data access layer with base repository pattern:
- `UserRepository`
- `CandidateRepository` (594 LOC)
- `CandidateTaskRepository`
- `TemplateRepository`
- `TemplateTaskRepository`
- `TemplateStageRepository`
- `DepartmentRepository`
- `DivisionRepository`
- `HiringStageRepository`
- `TaskDefinitionRepository`
- `NotificationRepository`
- `CommentRepository`
- And 15+ more...

#### 🟡 ServiceFactory: **Partially Updated**
`server/services/service-factory.ts` created with 17 services registered, but missing some registrations needed by tests.

#### ✅ Test Utilities: **MockServiceFactory Created**
`server/tests/utils/mockServiceFactory.ts` created to replace `InMemoryStorage`, but **NOT INTEGRATED INTO EXISTING TESTS**.

---

## Why Tests Are Failing

### Root Cause 1: Old Mock Infrastructure Still in Use
**Issue:** Tests still use old `InMemoryStorage` pattern

**Affected:** ~25 tests  
**Error:** `TypeError: storage.createUser is not a function`

**Why:**
- Old test code expects `storage` to be an `InMemoryStorage` instance
- New architecture provides `MockServiceFactory` instead
- Test utilities haven't been updated to use the new mock system

**Example from failing test:**
```typescript
// OLD - Still in tests:
await storage.createUser({ id: 'user1', ... });  // ❌ storage is undefined

// NEW - Should be:
await mockFactory.upsertUser({ id: 'user1', ... });
```

---

### Root Cause 2: Test Agent Builder Expects Services, Gets Undefined
**Issue:** `buildUserSessionPayload()` calls methods on `factory` that don't exist

**Affected:** ~15 tests  
**Error:** `TypeError: Cannot read properties of undefined (reading 'getUser')`

**Why:**
- `testAgent.ts` was updated to use `MockServiceFactory`
- But `MockServiceFactory` methods aren't fully implemented
- Tests call `factory.getUser()`, but the method is named differently or not exposed

**Example failure location:** `server/tests/utils/testAgent.ts:13:34`

---

### Root Cause 3: Mock Database Query Builders Incomplete
**Issue:** Mock database doesn't have all query chain methods

**Affected:** 4 tests (NotificationRepository.test.ts)  
**Error:** `TypeError: mockDb.select(...).from(...).where(...).orderBy is not a function`

**Why:**
- Test mocks for Drizzle ORM queries were partially implemented
- Missing chainable methods like `.orderBy()` on the mock query builder
- New repository methods use query chains not present in test mocks

---

### Root Cause 4: API Endpoints Return 500 Instead of Expected Status
**Issue:** Route handlers throw errors during test execution

**Affected:** ~12 tests  
**Error:** `expected 201 "Created", got 500 "Internal Server Error"`

**Why:**
- Routes try to use services/repositories
- Services/repositories aren't properly initialized in test environment
- Database dependencies not properly mocked/set up
- Dependency injection may not be working correctly in test context

---

### Root Cause 5: Updated Fields Missing From Responses
**Issue:** Database operations succeed, but response doesn't include updated fields

**Affected:** ~8 tests  
**Error:** `Expected values to be strictly equal: actual undefined - expected 'value'`

**Examples:**
- Task update returns without status field
- Candidate update returns without email field
- Response builders not including all fields

**Why:**
- Response mapping layer may not match new service response format
- Database layer updates working, but serialization incomplete
- Service responses missing fields that routes expect to include

---

### Root Cause 6: Test Fixture Data Doesn't Match New Architecture
**Issue:** Mock data doesn't account for repository-based entity creation

**Affected:** ~5 tests  
**Error:** `RangeError: Maximum call stack size exceeded`

**Why:**
- Circular references in mock data setup
- Test data factory creating self-referential structures
- No proper fixture factory for the new architecture

---

## Detailed Test File Analysis

### 🔴 Critical (Needs Complete Rewrite)

#### `server/tests/auth/authentication.test.ts` (4 failures)
**Issues:**
- Uses old `storage.createUser()` pattern
- Rate limiting tests not working with new service layer
- Password validation not integrated with new UserService

**Required Changes:**
1. Replace `storage.createUser()` with `mockFactory.upsertUser()`
2. Update rate limiting checks to work with new auth flow
3. Mock new `AuthenticationService` instead of storage

**Estimated Effort:** 2-3 hours

---

#### `server/tests/auth/candidateRoutesAuthorization.test.ts` (13 failures)
**Issues:**
- `buildUserSessionPayload()` can't access factory methods
- `factory.getUser()` returns undefined
- Authorization context not building properly

**Required Changes:**
1. Ensure `MockServiceFactory` implements all required methods:
   - `getUser(userId: string): Promise<User>`
   - `getUserRoles(userId: string): Promise<UserRole[]>`
   - `getUserDepartmentScopeIds(userId: string): Promise<string[]>`
   - `getUserDivisionScopeIds(userId: string): Promise<string[]>`
   - `getManagerCandidateScopeIds(userId: string): Promise<string[]>`

2. Update test setup to properly populate factory with test data

**Estimated Effort:** 3-4 hours

---

#### `server/tests/routes/candidates.test.ts` (15 failures)
**Issues:**
- Candidate creation returns 500 instead of 201
- Candidate lookup returns wrong UUID
- Filter operations not respecting scope

**Required Changes:**
1. Verify `CandidateService.createCandidate()` works with test database
2. Ensure `CandidateRepository.getCandidates()` applies filters correctly
3. Update response mapping to include all fields in response body

**Estimated Effort:** 4-5 hours

---

#### `server/tests/routes/tasks.test.ts` (20 failures)
**Issues:**
- Task creation returns 500 instead of 201
- Task updates return without updated fields
- List operations return 400 Bad Request

**Required Changes:**
1. Fix `TaskService.createTask()` to work with test environment
2. Ensure task update returns complete updated task object
3. Fix query parameter validation in task list endpoint

**Estimated Effort:** 5-6 hours

---

### 🟡 High Priority (Partial Rewrites)

#### `server/tests/repositories/HiringStageRepository.test.ts` (5 failures)
**Issues:**
- Infinite loop in mock data factory (line 40 self-references)
- Test fixture creates circular reference

**Required Changes:**
1. Fix test data factory to not create circular references
2. Implement proper mock data for HiringStage entities
3. Ensure mock Drizzle queries work with test data

**Estimated Effort:** 2 hours

---

#### `server/tests/repositories/NotificationRepository.test.ts` (4 failures)
**Issues:**
- Mock database query chain incomplete
- `.orderBy()` method missing on query builder

**Required Changes:**
1. Complete mock Drizzle query builder implementation
2. Add `.orderBy()` and other missing chainable methods
3. Ensure query results match expected structure

**Estimated Effort:** 1.5-2 hours

---

### 🟠 Medium Priority (Minor Updates)

#### `server/tests/routes/` - Other routes (20+ failures)
Various route tests need test data setup and mock service configuration.

**Estimated Effort:** 2-3 hours per route file

---

## Recommended Test Fix Implementation Plan

### Phase 1: Fix Test Infrastructure (Day 1)

**Priority: CRITICAL - Unblocks all other tests**

#### 1.1 Complete MockServiceFactory Implementation
**File:** `server/tests/utils/mockServiceFactory.ts`

**Changes needed:**
```typescript
// Expose all required methods used by buildUserSessionPayload():
export class MockServiceFactory {
  // These methods need to be public and working:
  async getUser(userId: string): Promise<User | undefined> { ... }
  async getUserRoles(userId: string): Promise<UserRole[]> { ... }
  async getUserDepartmentScopeIds(userId: string): Promise<string[]> { ... }
  async getUserDivisionScopeIds(userId: string): Promise<string[]> { ... }
  async getManagerCandidateScopeIds(userId: string): Promise<string[]> { ... }
  
  // And all other service methods:
  getCandidateService(): Partial<CandidateService> { ... }
  getTaskService(): Partial<TaskService> { ... }
  // etc.
}
```

**Estimated Effort:** 2-3 hours

#### 1.2 Update testEnvironment.ts
**File:** `server/tests/utils/testEnvironment.ts`

**Changes needed:**
- Use `MockServiceFactory` instead of `InMemoryStorage`
- Register mock services with a test service factory
- Ensure dependency injection works in test context

**Estimated Effort:** 1-2 hours

#### 1.3 Fix Mock Drizzle Query Builder
**File:** `server/tests/utils/` (may need new file)

**Changes needed:**
```typescript
// Add missing chainable methods to mock query builder:
mockDb.select().from().where().orderBy()  // currently .orderBy() missing
mockDb.select().from().where().limit()
mockDb.select().from().where().offset()
// etc.
```

**Estimated Effort:** 1.5 hours

---

### Phase 2: Fix Authentication Tests (Day 1)

**Priority: HIGH**

#### 2.1 Update `authentication.test.ts`
- Replace `storage.createUser()` with `mockFactory.upsertUser()`
- Update all test setup to use new mock factory
- Verify rate limiting works with new service layer

**Estimated Effort:** 2-3 hours

---

### Phase 3: Fix Authorization Tests (Day 2)

**Priority: HIGH**

#### 3.1 Update `candidateRoutesAuthorization.test.ts`
- Ensure `buildUserSessionPayload()` has access to factory methods
- Fix all 13 test failures by populating mock factory correctly
- Verify authorization policies work with new service layer

**Estimated Effort:** 3-4 hours

---

### Phase 4: Fix Repository Tests (Day 2)

**Priority: MEDIUM**

#### 4.1 Update `HiringStageRepository.test.ts`
- Fix infinite loop in test data factory
- Implement proper mock data for hiring stages
- Verify repository methods work correctly

**Estimated Effort:** 2 hours

#### 4.2 Update `NotificationRepository.test.ts`
- Complete mock query builder implementation
- Fix all 4 test failures

**Estimated Effort:** 1.5-2 hours

---

### Phase 5: Fix Route Integration Tests (Days 3-4)

**Priority: MEDIUM**

#### 5.1 Update `candidates.test.ts` (15 failures)
**Estimated Effort:** 4-5 hours

#### 5.2 Update `tasks.test.ts` (20 failures)
**Estimated Effort:** 5-6 hours

#### 5.3 Update other route tests
**Estimated Effort:** 2-3 hours each

---

## Quick Fix Checklist

These are the specific action items to fix the test failures:

### Immediate Actions (Today)

- [ ] **MockServiceFactory**: Ensure all methods used by `buildUserSessionPayload()` are implemented and public
  - [ ] `getUser(userId): Promise<User>`
  - [ ] `getUserRoles(userId): Promise<UserRole[]>`
  - [ ] `getUserDepartmentScopeIds(userId): Promise<string[]>`
  - [ ] `getUserDivisionScopeIds(userId): Promise<string[]>`
  - [ ] `getManagerCandidateScopeIds(userId): Promise<string[]>`

- [ ] **testEnvironment.ts**: Update to register mock services with test app
  - [ ] Use `MockServiceFactory` instance
  - [ ] Register services with Express app somehow (or use middleware injection)

- [ ] **Mock Drizzle Builder**: Add missing chainable methods (`.orderBy()`, `.limit()`, `.offset()`)

- [ ] **HiringStageRepository.test.ts**: Fix circular reference in mock data (line 40)

### Short-term Actions (This Week)

- [ ] **authentication.test.ts**: Replace `storage.*()` calls with `mockFactory.*()` calls (4 tests)
- [ ] **candidateRoutesAuthorization.test.ts**: Fix `buildUserSessionPayload()` calls (13 tests)
- [ ] **candidates.test.ts**: Fix API response serialization (15 tests)
- [ ] **tasks.test.ts**: Fix API response serialization (20 tests)
- [ ] **NotificationRepository.test.ts**: Complete mock query builder (4 tests)

---

## Files Requiring Changes

```
🔴 CRITICAL (Blocks everything):
  server/tests/utils/mockServiceFactory.ts
  server/tests/utils/testEnvironment.ts
  server/tests/utils/testAgent.ts

🔴 CRITICAL (Test infrastructure):
  server/tests/utils/[mock-drizzle-builder].ts  (create if doesn't exist)

🟡 HIGH (Auth & Authorization):
  server/tests/auth/authentication.test.ts
  server/tests/auth/candidateRoutesAuthorization.test.ts

🟡 HIGH (Repositories):
  server/tests/repositories/HiringStageRepository.test.ts
  server/tests/repositories/NotificationRepository.test.ts

🟠 MEDIUM (Route Integration):
  server/tests/routes/candidates.test.ts
  server/tests/routes/tasks.test.ts
  server/tests/routes/templates.test.ts
  server/tests/routes/users.test.ts
  server/tests/routes/auth.test.ts
  server/tests/services/task-due-date.service.test.ts
```

---

## Estimated Total Effort

| Phase | Duration | Critical |
|-------|----------|----------|
| Test Infrastructure Fixes | 4-6 hours | YES |
| Auth Tests Update | 2-3 hours | YES |
| Authorization Tests Update | 3-4 hours | YES |
| Repository Tests Update | 3-4 hours | NO |
| Route Integration Tests Update | 15-20 hours | NO |
| Testing & Validation | 2-3 hours | YES |
| **TOTAL** | **29-40 hours** | - |

**Estimated Timeline:**
- Phase 1-3: 1-2 days (unblocks other work)
- Phase 4-5: 3-4 days (feature testing)
- **Total: 4-6 days** to get to 100% test pass rate

---

## Key Documentation Resources

Your refactoring documents provide excellent guidance:

1. **`New Refactoring Plan - 120425.md`** - Comprehensive architecture overview
   - Shows which repositories/services exist
   - Lists which routes have been migrated
   - Documents Phase 1-7 progress

2. **`Storage-Removal-Plan.md`** - Detailed test infrastructure migration guide
   - Contains `MockServiceFactory` design
   - Shows how to seed test data
   - Documents what types to move where

3. **`MVP_READINESS_REPORT.md`** - Architecture quality assessment
   - Confirms architecture is MVP-ready
   - Lists all 30+ services
   - Documents all 27 repositories

---

## Next Steps

1. **Review this report** with your team
2. **Start Phase 1** - Fix test infrastructure (highest impact, unblocks everything)
3. **Run tests incrementally** after each phase
4. **Track progress** against the estimated effort
5. **Consider pairing** on complex test rewrites (route integration tests)

The refactoring itself was **excellently designed** - the test infrastructure just needs to be updated to match the new architecture.

---

**Report Generated By:** GitHub Copilot  
**Repository:** OnBoardPro (dev branch)  
**Analysis Date:** December 6, 2025
