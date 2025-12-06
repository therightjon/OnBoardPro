# Storage.ts Removal Plan: Complete Elimination

**Date:** December 5, 2025  
**Goal:** Remove `storage.ts` entirely, eliminate duplicate code, update test infrastructure  
**Estimated Effort:** 5-7 days  
**Status:** Approved - Ready for Implementation

---
 
 IMPORTANT

Ask me questions whenever decisions are ambiguous. Follow this plan until all phases are complete.

Important
Be fully thorough and comprehensive in your understanding before performing any modifications.
Before any database-affecting change, generate a backup using the following command pattern:

docker exec -t onboardpro_db \
  pg_dump -U db_user onboardpro \
  > database_backup_120425_Refactor_<PHASE>-<TASK>.sql

Use the <PHASE> and <TASK> placeholders to clearly identify what part of the refactor the backup corresponds to. Never proceed with schema-impacting changes, data migrations, or transactional rewrites without creating this backup first.

---

## Executive Summary

The route migration to services is **100% complete** - no routes import storage.ts anymore. However, `storage.ts` (3,743 LOC) remains because:
1. Test infrastructure (`InMemoryStorage`) implements the `IStorage` interface
2. Types are exported from storage.ts
3. Duplicate implementations exist in both storage.ts and services/repositories

This plan eliminates storage.ts entirely.

---

## Current State (December 5, 2025)

| Metric | Status |
|--------|--------|
| Routes using storage | 0/10 ✅ |
| Routes using services | 10/10 ✅ |
| storage.ts LOC | 3,743 (duplicate code) |
| InMemoryStorage LOC | 550 (implements IStorage) |
| Service Factory | Complete with 17 services |
| Repository Layer | Complete with 18 repositories |

---

## Phase 1: Consolidate Types & Interfaces (Day 1)

### 1.1 Move Exported Types from storage.ts to base/types.ts

| Type | Current Location | Target Location | Status |
|------|------------------|-----------------|--------|
| `AuthorizationContext` | storage.ts:130 | `repositories/base/types.ts` | ✅ Already exists |
| `CandidateScopeFilters` | storage.ts:140 | `repositories/base/types.ts` | ✅ Already exists |
| `DivisionActiveCandidateSummary` | storage.ts:148 | `repositories/base/types.ts` | ✅ Already exists |
| `TemplateExpansionTask` | storage.ts:113 | `repositories/base/types.ts` | ✅ Already exists |
| `TemplateExpansionResult` | storage.ts:125 | `repositories/base/types.ts` | ✅ Already exists |
| `RecentActivityEventType` | storage.ts:156 | `services/dashboard/dashboard.service.ts` | ✅ Already there |
| `RecentActivityEvent` | storage.ts:162 | `services/dashboard/dashboard.service.ts` | ✅ Already there |
| `LdapSettings` | storage.ts:93 | `services/auth/auth-provider.service.ts` | ⬜ Move |
| `DatabaseStorageOptions` | storage.ts:372 | DELETE (not needed) | ⬜ Remove |
| `IStorage` | storage.ts:210 | DELETE after test migration | ⬜ Remove |

### 1.2 Create New Shared Types File

Create `server/types/index.ts` to export all shared types from a central location:

```typescript
// server/types/index.ts
export type {
  AuthorizationContext,
  CandidateScopeFilters,
  DivisionActiveCandidateSummary,
  TemplateExpansionTask,
  TemplateExpansionResult
} from "../repositories/base/types";

export type { LdapSettings } from "../services/auth/auth-provider.service";
export type { RecentActivityEventType, RecentActivityEvent } from "../services/dashboard/dashboard.service";
```

---

## Phase 2: Update Test Infrastructure (Days 2-3)

### 2.1 Replace InMemoryStorage with Service Mocks

**Current Problem:** `InMemoryStorage` (550 LOC) implements `Partial<IStorage>` interface and must be updated for every storage.ts change.

**New Approach:** Create mock service factories that return pre-configured mock services.

**Files to Create:**

```
server/tests/utils/
├── mockServiceFactory.ts     (NEW - creates mock services)
├── testFixtures.ts           (NEW - common test data)
├── testEnvironment.ts        (UPDATE - use mockServiceFactory)
├── testAgent.ts              (UPDATE - use services directly)
└── inMemoryStorage.ts        (DELETE after migration)
```

### 2.2 Create mockServiceFactory.ts

```typescript
// server/tests/utils/mockServiceFactory.ts
import type { CandidateService } from "../../services/candidates/candidate.service";
import type { UserService } from "../../services/users/user.service";
import type { User, Candidate, Department, Division } from "@shared/schemas";
import type { AuthorizationContext } from "../../repositories/base/types";

export interface MockDataStores {
  users?: Map<string, User>;
  candidates?: Map<string, Candidate>;
  departments?: Map<string, Department>;
  divisions?: Map<string, Division>;
  userRoles?: Map<string, Set<string>>;
  userDepartmentScopes?: Map<string, Set<string>>;
  userDivisionScopes?: Map<string, Set<string>>;
  managerCandidateScopes?: Map<string, Set<string>>;
}

export class MockServiceFactory {
  private userData: Map<string, User>;
  private candidateData: Map<string, Candidate>;
  private userRoles: Map<string, Set<string>>;
  private userDepartmentScopes: Map<string, Set<string>>;
  private userDivisionScopes: Map<string, Set<string>>;
  private managerCandidateScopes: Map<string, Set<string>>;

  constructor(options: MockDataStores = {}) {
    this.userData = options.users ?? new Map();
    this.candidateData = options.candidates ?? new Map();
    this.userRoles = options.userRoles ?? new Map();
    this.userDepartmentScopes = options.userDepartmentScopes ?? new Map();
    this.userDivisionScopes = options.userDivisionScopes ?? new Map();
    this.managerCandidateScopes = options.managerCandidateScopes ?? new Map();
  }

  // Seeding helpers
  upsertUser(user: User, extra?: { roles?: string[]; departmentScopes?: string[]; divisionScopes?: string[]; managedCandidateIds?: string[] }): void {
    this.userData.set(user.id, { ...user });
    if (extra?.roles) this.userRoles.set(user.id, new Set(extra.roles));
    if (extra?.departmentScopes) this.userDepartmentScopes.set(user.id, new Set(extra.departmentScopes));
    if (extra?.divisionScopes) this.userDivisionScopes.set(user.id, new Set(extra.divisionScopes));
    if (extra?.managedCandidateIds) this.managerCandidateScopes.set(user.id, new Set(extra.managedCandidateIds));
  }

  upsertCandidate(candidate: Candidate): void {
    this.candidateData.set(candidate.id, { ...candidate });
  }

  reset(): void {
    this.userData.clear();
    this.candidateData.clear();
    this.userRoles.clear();
    this.userDepartmentScopes.clear();
    this.userDivisionScopes.clear();
    this.managerCandidateScopes.clear();
  }

  // Build authorization context (moved from storage)
  buildAuthorizationContext(user: Express.User | null | undefined): AuthorizationContext {
    const roles = new Set<string>();
    const departmentIds = new Set<string>();
    const divisionIds = new Set<string>();
    const managedCandidateIds = new Set<string>();

    if (user?.id) {
      const persisted = this.userData.get(user.id);
      if (persisted?.role) roles.add(persisted.role);
      
      const extraRoles = this.userRoles.get(user.id);
      if (extraRoles) for (const role of extraRoles) roles.add(role);
      
      const deptScopes = this.userDepartmentScopes.get(user.id);
      if (deptScopes) for (const dept of deptScopes) departmentIds.add(dept);
      
      const divScopes = this.userDivisionScopes.get(user.id);
      if (divScopes) for (const div of divScopes) divisionIds.add(div);
      
      const managed = this.managerCandidateScopes.get(user.id);
      if (managed) for (const candidate of managed) managedCandidateIds.add(candidate);
    }

    if (user?.role) roles.add(user.role);

    return {
      userId: user?.id ?? null,
      roles,
      departmentIds,
      divisionIds,
      managedCandidateIds,
      privileged: roles.has("system_admin") || roles.has("hr_staff"),
      isCandidate: roles.has("candidate")
    };
  }

  getUserService(): Partial<UserService> {
    return {
      getUser: async (id: string) => this.userData.get(id),
      getUserByEmail: async (email: string) => {
        for (const user of this.userData.values()) {
          if (user.email.toLowerCase() === email.toLowerCase()) return user;
        }
        return undefined;
      },
      getUserRoles: async (userId: string) => {
        const set = this.userRoles.get(userId);
        if (!set) return [];
        return Array.from(set).map((role) => ({
          id: crypto.randomUUID(),
          userId,
          role: role as any,
          createdAt: new Date(),
          updatedAt: new Date()
        }));
      },
      getUserDepartmentScopeIds: async (userId: string) => 
        Array.from(this.userDepartmentScopes.get(userId) ?? []),
      getUserDivisionScopeIds: async (userId: string) => 
        Array.from(this.userDivisionScopes.get(userId) ?? []),
      getManagerCandidateScopeIds: async (managerId: string) => 
        Array.from(this.managerCandidateScopes.get(managerId) ?? []),
    };
  }

  getCandidateService(): Partial<CandidateService> {
    return {
      getCandidate: async (id: string) => this.candidateData.get(id),
      getCandidates: async () => Array.from(this.candidateData.values()),
    };
  }
}
```

### 2.3 Update testEnvironment.ts

```typescript
// server/tests/utils/testEnvironment.ts (updated)
import { MockServiceFactory } from "./mockServiceFactory";

export interface TestEnvironment {
  mockFactory: MockServiceFactory;
  dispose(): Promise<void>;
}

export async function createTestEnvironment(): Promise<TestEnvironment> {
  const mockFactory = new MockServiceFactory();

  const dispose = async () => {
    mockFactory.reset();
  };

  return {
    mockFactory,
    dispose
  };
}
```

### 2.4 Update testAgent.ts

```typescript
// server/tests/utils/testAgent.ts (updated)
import express from "express";
import type { Express } from "express";
import supertest from "supertest";
import type { SuperTest, Test } from "supertest";
import type { RegisterRoutesOptions } from "../../routes";
import { registerRoutes } from "../../routes";
import type { MockServiceFactory } from "./mockServiceFactory";

export async function buildUserSessionPayload(mockFactory: MockServiceFactory, userId: string) {
  const userService = mockFactory.getUserService();
  const baseUser = await userService.getUser!(userId);
  if (!baseUser) return null;

  const [roles, departmentScopes, divisionScopes, managedCandidateIds] = await Promise.all([
    userService.getUserRoles!(userId),
    userService.getUserDepartmentScopeIds!(userId),
    userService.getUserDivisionScopeIds!(userId),
    userService.getManagerCandidateScopeIds!(userId)
  ]);

  const mergedRoles = new Set<string>([baseUser.role, ...roles.map((entry) => entry.role)]);

  return {
    ...baseUser,
    roles: Array.from(mergedRoles),
    departmentScopes: departmentScopes.filter(Boolean),
    divisionScopes: divisionScopes.filter(Boolean),
    managedCandidateIds: managedCandidateIds.filter(Boolean)
  } satisfies Express.User;
}

export interface CreateAgentOptions {
  userId?: string | null;
  mockFactory: MockServiceFactory;
  registerOptions?: RegisterRoutesOptions;
}

export async function createAuthedAgent({
  userId,
  mockFactory,
  registerOptions
}: CreateAgentOptions): Promise<{ agent: SuperTest<Test>; app: Express }> {
  const app = express();
  app.use(express.json());

  const sessionUser = userId ? await buildUserSessionPayload(mockFactory, userId) : null;

  app.use((req, _res, next) => {
    if (sessionUser) {
      req.user = { ...sessionUser } as Express.User;
      req.isAuthenticated = (() => true) as any;
    } else {
      req.user = undefined;
      req.isAuthenticated = (() => false) as any;
    }
    next();
  });

  await registerRoutes(app, { skipAuthSetup: true, ...(registerOptions ?? {}) });

  return {
    agent: supertest(app),
    app
  };
}
```

### 2.5 Test Files Requiring Updates

| Test File | Current Dependency | Migration Required |
|-----------|-------------------|-------------------|
| `routes/candidates.test.ts` | `InMemoryStorage`, `testEnvironment` | Update to `MockServiceFactory` |
| `routes/tasks.test.ts` | `InMemoryStorage`, `testEnvironment` | Update to `MockServiceFactory` |
| `api/integration.test.ts` | `InMemoryStorage` | Update to `MockServiceFactory` |
| `db/storage.test.ts` | `InMemoryStorage`, `AuthorizationContext` | DELETE entirely |
| `auth/*.test.ts` | May use `testEnvironment` | Update imports |

---

## Phase 3: Create Session Store Module (Day 3)

The only thing storage.ts provides that services don't is `sessionStore`. Extract to separate module:

```typescript
// server/db/session.ts
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./connection";

const PostgresSessionStore = connectPg(session);

export function createSessionStore(): session.Store {
  return new PostgresSessionStore({ pool });
}

export const sessionStore = createSessionStore();
```

Update any imports of `sessionStore` from storage.ts to use this new module.

---

## Phase 4: Update Legacy Feature Module (Day 4)

### 4.1 Update notifications/routes.ts

```typescript
// server/features/notifications/routes.ts

// BEFORE:
import type { IStorage } from "../../db/storage";
export async function listNotificationsHandler(storage: Pick<IStorage, "getNotifications">, ...)

// AFTER:
import type { NotificationService } from "../../services/shared/notification.service";
export async function listNotificationsHandler(notificationService: NotificationService, ...)
```

---

## Phase 5: Delete storage.ts and Related Files (Day 5)

### 5.1 Files to Delete

| File | LOC | Reason |
|------|-----|--------|
| `server/db/storage.ts` | 3,743 | Primary target - all functionality moved to services |
| `server/tests/utils/inMemoryStorage.ts` | 550 | Replaced by mockServiceFactory |
| `server/tests/db/storage.test.ts` | ~200 | Tests storage.ts directly |

### 5.2 Files to Update (Remove storage.ts imports)

| File | Changes Required |
|------|------------------|
| `server/tests/utils/testEnvironment.ts` | Remove `resetStorage`, `setStorage` imports |
| `server/tests/utils/testAgent.ts` | Remove `IStorage` type import |
| `server/tests/utils/seedAuthorizationFixtures.ts` | Update to use mockServiceFactory |
| `server/features/notifications/routes.ts` | Use service types |
| `CONTRIBUTING.md` | Update documentation examples |
| `docs/AUTHORIZATION_SERVICE.md` | Update documentation examples |

---

## Phase 6: Final Cleanup & Verification (Days 6-7)

### 6.1 Run Full Test Suite

```bash
npm run test
npm run lint
npm run typecheck
```

### 6.2 Verify Application

- Start the application: `npm run dev`
- Test all routes manually or via integration tests
- Verify authorization works correctly
- Test session persistence

### 6.3 Update Documentation

- Update `docs/ARCHITECTURE.md`
- Mark `docs/REFACTORING_PLAN.md` as complete
- Update `docs/New Refactoring Plan - 120425.md` status

---

## Risk Mitigation

### High Risk Items

| Risk | Mitigation |
|------|------------|
| Test failures after InMemoryStorage removal | Create comprehensive mockServiceFactory first, migrate tests incrementally |
| Session store removal breaks auth | Extract sessionStore to separate module before deleting storage.ts |
| Missing method in services | Audit all ~120 storage methods and verify service equivalents exist |
| Type errors from IStorage removal | TypeScript will catch at compile time |

### Rollback Plan

1. Keep `storage.ts` on a branch until all tests pass
2. Delete incrementally:
   - First: Move types out
   - Second: Update tests
   - Third: Delete storage.ts
   - Fourth: Delete inMemoryStorage.ts

---

## Summary: Files Changed

### Created (New)
| File | Purpose |
|------|---------|
| `server/types/index.ts` | Shared type exports |
| `server/tests/utils/mockServiceFactory.ts` | Test mocks |
| `server/tests/utils/testFixtures.ts` | Common test data |
| `server/db/session.ts` | Session store factory |

### Deleted
| File | LOC |
|------|-----|
| `server/db/storage.ts` | 3,743 |
| `server/tests/utils/inMemoryStorage.ts` | 550 |
| `server/tests/db/storage.test.ts` | ~200 |

### Modified
| File | Changes |
|------|---------|
| `server/tests/utils/testEnvironment.ts` | Use mockServiceFactory |
| `server/tests/utils/testAgent.ts` | Use services directly |
| `server/tests/routes/candidates.test.ts` | Update test setup |
| `server/tests/routes/tasks.test.ts` | Update test setup |
| `server/tests/api/integration.test.ts` | Update test setup |
| `server/features/notifications/routes.ts` | Use service types |
| `server/services/auth/auth-provider.service.ts` | Add LdapSettings type export |
| Various documentation files | Update examples |

### Net Result
- **Removed:** ~4,500 LOC of duplicate code
- **Added:** ~300 LOC of mock infrastructure
- **Net reduction:** ~4,200 LOC

---

## Implementation Checklist

### Day 1: Types
- [ ] Create `server/types/index.ts`
- [ ] Move `LdapSettings` to `auth-provider.service.ts`
- [ ] Update imports across codebase

### Day 2-3: Test Infrastructure
- [ ] Create `mockServiceFactory.ts`
- [ ] Create `testFixtures.ts`
- [ ] Update `testEnvironment.ts`
- [ ] Update `testAgent.ts`
- [ ] Migrate `routes/candidates.test.ts`
- [ ] Migrate `routes/tasks.test.ts`
- [ ] Migrate `api/integration.test.ts`
- [ ] Delete `db/storage.test.ts`

### Day 4: Session & Legacy
- [ ] Create `server/db/session.ts`
- [ ] Update `features/notifications/routes.ts`
- [ ] Update any remaining storage imports

### Day 5: Delete
- [ ] Delete `server/db/storage.ts`
- [ ] Delete `server/tests/utils/inMemoryStorage.ts`
- [ ] Run typecheck to find any remaining imports
- [ ] Fix any remaining issues

### Day 6-7: Verification
- [ ] Run full test suite
- [ ] Manual application testing
- [ ] Update documentation
- [ ] Code review

---

**Document Version:** 1.0  
**Created:** December 5, 2025  
**Author:** Architecture Review  
**Status:** Ready for Implementation
