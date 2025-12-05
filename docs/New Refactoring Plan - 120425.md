# Storage.ts Decomposition: Comprehensive Assessment & Plan

**Date:** December 4, 2025  
**Status:** Assessment Complete - Awaiting Approval  
**Author:** Architecture Review

---

## Executive Summary

Your refactoring plan from `REFACTORING_PLAN.md` has made **substantial progress** but the migration is **incomplete**. While the infrastructure (repositories, services, routes, utils) has been created, **`storage.ts` remains the primary source of truth at 3,744 LOC** - larger than when the plan was created. Routes still import `storage` directly rather than using the new service/repository layer.

---

## Current State Analysis

### ✅ **Phase 1: Foundation & Utilities - COMPLETE (100%)**

| Utility File | LOC | Status |
|-------------|-----|--------|
| `date.utils.ts` | 111 | ✅ Extracted |
| `business-day.utils.ts` | 60 | ✅ Extracted |
| `mention-key.utils.ts` | 109 | ✅ Extracted |
| `authorization.utils.ts` | 208 | ✅ Extracted |
| `sanitization.utils.ts` | 70 | ✅ Extracted |
| `preferences.utils.ts` | 82 | ✅ Extracted |
| `invitation.utils.ts` | 37 | ✅ Extracted |
| `notification.utils.ts` | 171 | ✅ Extracted |
| `hiring-phase.utils.ts` | 226 | ✅ Extracted |

**Base Repository Infrastructure:**
- `BaseRepository.ts` ✅ Created (pagination, cursor encoding, scope filters)
- `base/types.ts` ✅ Created (AuthorizationContext, CandidateScopeFilters, etc.)

---

### ✅ **Phase 2-5: Repositories - STRUCTURE COMPLETE, INTEGRATION INCOMPLETE**

All repository files exist with proper class structure:

| Repository | File | Status | Integration |
|-----------|------|--------|-------------|
| **Reference Data** ||||
| HiringStageRepository | ✅ Created | ⚠️ Methods implemented | ❌ Not used by routes |
| TaskDefinitionRepository | ✅ Created | ⚠️ Methods implemented | ❌ Not used by routes |
| ReferenceDataRepository | ✅ Created | ⚠️ Methods implemented | ❌ Not used by routes |
| **Organizational** ||||
| DepartmentRepository | ✅ Created | ⚠️ Methods implemented | ❌ Not used by routes |
| DivisionRepository | ✅ Created | ⚠️ Methods implemented | ❌ Not used by routes |
| **Users** ||||
| UserRepository | ✅ Created | ⚠️ Methods implemented | ⚠️ Partial (via UserService) |
| UserIdentityRepository | ✅ Created | ⚠️ Methods implemented | ❌ Not used by routes |
| UserPreferencesRepository | ✅ Created | ⚠️ Methods implemented | ❌ Not used by routes |
| InvitationRepository | ✅ Created | ⚠️ Methods implemented | ❌ Not used by routes |
| **Templates** ||||
| TemplateRepository | ✅ Created | ⚠️ Methods implemented | ⚠️ Partial (via TemplateService) |
| TemplateTaskRepository | ✅ Created | ⚠️ Methods implemented | ⚠️ Partial |
| TemplateStageRepository | ✅ Created | ⚠️ Methods implemented | ⚠️ Partial |
| **Candidates** ||||
| CandidateRepository | ✅ Created (594 LOC) | ✅ Methods implemented | ⚠️ Partial (via CandidateService) |
| CandidateTaskRepository | ✅ Created | ✅ Methods implemented | ⚠️ Partial (via TaskService) |
| CandidateStageRepository | ✅ Created | ⚠️ Methods implemented | ❌ Not used by routes |
| CandidateFollowerRepository | ✅ Created | ⚠️ Methods implemented | ⚠️ Partial |
| **Standalone** ||||
| CommentRepository | ✅ Created | ⚠️ Methods implemented | ❌ Not used by routes |
| NotificationRepository | ✅ Created | ⚠️ Methods implemented | ❌ Not used by routes |
| SearchRepository | ✅ Created | ⚠️ Methods implemented | ❌ Not used by routes |

---

### ⚠️ **Phase 6: Service Layer - PARTIALLY COMPLETE (40%)**

| Service | Status | Notes |
|---------|--------|-------|
| `CandidateService` | ⚠️ Partial | Used in candidates.routes.ts |
| `TaskService` | ⚠️ Partial | Used in tasks.routes.ts |
| `TemplateService` | ⚠️ Partial | Structure exists |
| `TemplateExpansionService` | ✅ Implemented (396 LOC) | Complex logic extracted |
| `TemplateEstimationService` | ✅ Created | Structure exists |
| `TaskDueDateService` | ✅ Created | Structure exists |
| `UserService` | ⚠️ Partial | Basic structure |
| `AuthorizationService` | ✅ Created | Used in routes |
| **MISSING** |||
| `NotificationService` | ❌ Not created | Business logic in storage.ts |
| `UserInvitationService` | ❌ Not created | Business logic in storage.ts |
| `CandidateStatusService` | ❌ Not created | `updateCandidateStatus` still in storage.ts |
| `CommentService` | ❌ Not created | Business logic in storage.ts |
| `CandidateEstimationService` | ❌ Not created | `estimateCandidate` still in storage.ts |

---

### ⚠️ **Phase 7: Route Decomposition - STRUCTURE COMPLETE, INTEGRATION INCOMPLETE**

| Route File | LOC | Uses Service Layer | Uses Storage |
|-----------|-----|-------------------|--------------|
| `candidates.routes.ts` | 867 | ⚠️ Partial (`getCandidateService()`) | ✅ Yes |
| `tasks.routes.ts` | ~500 | ⚠️ Partial | ✅ Yes |
| `templates.routes.ts` | ~600 | ❌ No | ✅ Yes |
| `users.routes.ts` | ~400 | ❌ No | ✅ Yes |
| `organizations.routes.ts` | ~200 | ❌ No | ✅ Yes |
| `auth.routes.ts` | ~300 | ❌ No | ✅ Yes |
| `notifications.routes.ts` | ~200 | ❌ No | ✅ Yes |
| `search.routes.ts` | ~150 | ❌ No | ✅ Yes |
| `settings.routes.ts` | ~100 | ❌ No | ✅ Yes |
| `reference-data.routes.ts` | ~200 | ❌ No | ✅ Yes |
| **Original routes.ts** | **973** | ❌ No | ✅ Yes |

**Key Finding:** All routes still import `storage` from `"../db/storage"` and call storage methods directly. The service factory exists but is minimally used.

---

### ❌ **Phase 8-10: Migration & Deprecation - NOT STARTED**

- Storage facade not implemented
- IStorage interface still fully implemented in DatabaseStorage
- No deprecation warnings
- Documentation not updated for new architecture

---

## Storage.ts Method Inventory (3,744 LOC)

### Methods That SHOULD Be Delegated to Repositories (Already Have Counterparts)

| Method | LOC | Repository Counterpart | Priority |
|--------|-----|----------------------|----------|
| `getUser`, `getUserByEmail`, `getUserByUsername` | ~20 | UserRepository | High |
| `createUser`, `updateUser`, `getAllUsers` | ~90 | UserRepository | High |
| `getUserRoles`, `setUserRoles`, `addUserRoles` | ~60 | UserRepository | High |
| `getUserDepartmentScopeIds`, `getUserDivisionScopeIds`, `getManagerCandidateScopeIds` | ~30 | UserRepository | High |
| `disableUser`, `enableUser`, `updateLastLogin`, `getUserOpenTaskCount` | ~70 | UserRepository | High |
| `getCandidates`, `getCandidate` | ~250 | CandidateRepository | High |
| `createCandidate`, `updateCandidate` | ~30 | CandidateRepository | High |
| `getCandidateTasks`, `getCandidateTask` | ~180 | CandidateTaskRepository | High |
| `createCandidateTask`, `updateCandidateTask` | ~40 | CandidateTaskRepository | High |
| `deleteCandidateTask`, `archiveCandidateTask` | ~15 | CandidateTaskRepository | High |
| `getTemplates`, `getTemplate`, `createTemplate` | ~100 | TemplateRepository | High |
| `updateTemplate`, `archiveTemplate` | ~30 | TemplateRepository | High |
| `getTemplateTasks`, `getTemplateTask` | ~30 | TemplateTaskRepository | High |
| `createTemplateTask`, `updateTemplateTask`, `archiveTemplateTask` | ~80 | TemplateTaskRepository | High |
| `getTemplateStages`, `getTemplateStage` | ~20 | TemplateStageRepository | High |
| `createTemplateStage`, `updateTemplateStage`, `deleteTemplateStage` | ~60 | TemplateStageRepository | High |
| `reorderTemplateStages` | ~40 | TemplateStageRepository | Medium |
| `getDepartments`, `getDivisions` | ~30 | DepartmentRepository, DivisionRepository | High |
| `createDepartment`, `createDivision` | ~20 | DepartmentRepository, DivisionRepository | High |
| `updateDepartment`, `updateDivision` | ~20 | DepartmentRepository, DivisionRepository | High |
| `getHiringStages`, `createHiringStage`, `updateHiringStage`, `deleteHiringStage` | ~60 | HiringStageRepository | High |
| `getTaskDefinitions`, `getTaskDefinition`, `createTaskDefinition`, `updateTaskDefinition` | ~50 | TaskDefinitionRepository | High |
| `getTaskCategories`, `getTaskPriorities`, `getCandidateTypes`, `getFacultyRanks` | ~20 | ReferenceDataRepository | High |
| `getNotifications`, `setNotificationRead`, `markAllNotificationsRead` | ~80 | NotificationRepository | High |
| `getCandidateComments`, `getTaskComments`, `createComment`, `editComment`, `deleteComment` | ~180 | CommentRepository | High |
| `getCommentStats` | ~60 | CommentRepository | Medium |
| `searchDepartments`, `searchDivisions`, `searchUsers` | ~100 | SearchRepository | High |
| `getUserPreferences`, `upsertUserPreferences` | ~80 | UserPreferencesRepository | High |
| `getUserIdentities`, `getUserIdentityByProvider`, `createUserIdentity`, `updateUserIdentity`, `deleteUserIdentity` | ~60 | UserIdentityRepository | High |
| `createInvitation`, `getInvitationByToken`, `consumeInvitation`, `findValidPendingInviteForIdentifier`, `getPendingInvitationsForUsersList` | ~120 | InvitationRepository | High |
| `getAllAuthProviders`, `getAuthProvider`, `updateAuthProvider` | ~30 | *New: AuthProviderRepository* | Medium |

### Methods That Require NEW Services (Complex Business Logic)

| Method | LOC | Proposed Service | Complexity | Priority |
|--------|-----|-----------------|------------|----------|
| `expandTemplate` | ~200 | ✅ TemplateExpansionService (exists) | Very High | Complete |
| `recomputeCandidateDueDates` | ~60 | TaskDueDateService | High | High |
| `estimateTemplate` | ~180 | ✅ TemplateEstimationService (exists) | High | Complete |
| `estimateCandidate` | ~120 | *New: CandidateEstimationService* | High | Medium |
| `updateCandidateStatus` | ~130 | *New: CandidateStatusService* | Very High | High |
| `resetCandidateTasksForReactivation` | ~20 | CandidateService | Medium | Medium |
| `resolveCandidateSelfAssignments` | ~30 | CandidateService | Medium | Medium |
| `getDashboardTasks` | ~60 | *Move to: CandidateTaskRepository* | Medium | Medium |
| `getDivisionActiveCandidateCounts` | ~50 | *Move to: CandidateRepository or DashboardService* | Medium | Low |
| `getRecentActivityEvents` | ~100 | *New: ActivityService or DashboardService* | High | Low |
| `getCandidateStageHistory` | ~40 | CandidateStageRepository | Medium | Medium |
| `getCandidateFollowers`, `addCandidateFollower`, `removeCandidateFollower` | ~30 | CandidateFollowerRepository | Low | High |
| `getCandidateTemplateStages`, `createCandidateTemplateStage`, `upsertCandidateTemplateStages` | ~50 | CandidateStageRepository | Medium | High |
| `getSystemSettings`, `setSystemSettings` | ~30 | *New: SystemSettingsRepository* | Low | Medium |
| `getLdapSettings`, `setLdapSettings`, `getLdapConfigured` | ~80 | *New: LdapSettingsService* | Medium | Medium |

### Utility Methods That Should Remain in Storage (Internal Helpers)

| Method | LOC | Notes |
|--------|-----|-------|
| `buildAuthorizationContext` | ~50 | Could move to AuthorizationService |
| `buildCandidateVisibilityChecker` | ~30 | Could move to AuthorizationService |
| `decodeCursor`, `encodeCursor` | ~15 | Already in BaseRepository |
| `buildMentionKeyBase`, `ensureUniqueMentionKey`, `generateMentionKey` | ~40 | Move to mention-key.utils.ts |
| `applyScopeFilters` | ~30 | Already in BaseRepository |
| `countBusinessDays` (private) | ~15 | Already in business-day.utils.ts |

---

## Recommended Decomposition Plan

### **Phase A: Critical Path - Enable Route Migration (Days 1-2)**

**Goal:** Wire up routes to use repositories through services, removing storage dependency.

#### A.1: Complete Service Factory (Day 1)

Add all remaining services to the factory:

```
server/services/service-factory.ts (update):
- Add NotificationRepository, CommentRepository, SearchRepository
- Add UserIdentityRepository, UserPreferencesRepository, InvitationRepository  
- Add DepartmentRepository, DivisionRepository
- Add ReferenceDataRepository, HiringStageRepository, TaskDefinitionRepository
- Add CandidateStageRepository
- Create getNotificationService(), getSearchService(), getReferenceDataService()
```

**Files to create:**
- `server/services/users/user-invitation.service.ts` - Invitation creation, email sending
- `server/services/candidates/candidate-status.service.ts` - Status transitions, task cascade
- `server/services/shared/notification.service.ts` - Notification creation and routing

#### A.2: Update Routes to Use Services (Day 2)

Priority order for route migration:

1. **reference-data.routes.ts** (simplest, 9 routes) → ReferenceDataService
2. **search.routes.ts** (4 routes) → SearchService  
3. **organizations.routes.ts** (10 routes) → DepartmentService, DivisionService
4. **notifications.routes.ts** (5 routes) → NotificationService
5. **settings.routes.ts** (5 routes) → SystemSettingsService
6. **users.routes.ts** (13 routes) → UserService (expand existing)
7. **auth.routes.ts** (7 routes) → UserInvitationService, AuthProviderService
8. **templates.routes.ts** (19 routes) → TemplateService (expand existing)
9. **tasks.routes.ts** (9 routes) → TaskService (expand existing)
10. **candidates.routes.ts** (16 routes) → CandidateService (expand existing)

---

### **Phase B: Storage Facade (Day 3)**

**Goal:** Create a thin facade that delegates to repositories/services while maintaining backward compatibility.

```typescript
// server/db/storage.ts (rewritten)

/**
 * @deprecated Use repositories and services directly. This facade exists for backward compatibility only.
 */
export class DatabaseStorage implements IStorage {
  private readonly candidateRepo: CandidateRepository;
  private readonly userRepo: UserRepository;
  // ... all other repos
  
  // Delegate all methods to appropriate repositories
  async getUser(id: string) {
    console.warn('DEPRECATED: Use UserRepository.getById() instead');
    return this.userRepo.getById(id);
  }
  
  async getCandidates(filters?: any, auth?: AuthorizationContext) {
    console.warn('DEPRECATED: Use CandidateRepository.getCandidates() instead');
    return this.candidateRepo.getCandidates(filters, auth);
  }
  
  // ... etc
}
```

---

### **Phase C: Remove Storage Dependencies from Routes (Days 4-5)**

**Goal:** Replace all `import { storage } from "../db/storage"` with service imports.

| Route File | Changes Required |
|-----------|------------------|
| candidates.routes.ts | Replace remaining storage calls with CandidateService |
| tasks.routes.ts | Replace storage calls with TaskService |
| templates.routes.ts | Replace storage calls with TemplateService |
| users.routes.ts | Replace storage calls with UserService |
| organizations.routes.ts | Replace storage calls with DepartmentService/DivisionService |
| auth.routes.ts | Replace storage calls with UserInvitationService |
| notifications.routes.ts | Replace storage calls with NotificationService |
| search.routes.ts | Replace storage calls with SearchService |
| settings.routes.ts | Replace storage calls with SystemSettingsService |
| reference-data.routes.ts | Replace storage calls with ReferenceDataService |
| routes.ts (remaining) | Migrate remaining routes to dedicated files |

---

### **Phase D: Delete Duplicate Code from Storage.ts (Day 5-6)**

Once all routes use services/repositories:

1. Remove method implementations from `DatabaseStorage`
2. Keep only facade delegations with deprecation warnings
3. Add telemetry to track remaining usages
4. Eventually replace `IStorage` interface with repository interfaces

**Target: Reduce storage.ts from 3,744 LOC to ~300 LOC (facade only)**

---

### **Phase E: Test Coverage Enhancement (Day 6-7)**

Current test files in `server/tests/`:
- `repositories/`: 4 tests (HiringStage, Notification, TaskDefinition, User.integration)
- `services/`: 3 tests (Authorization, advance-stage, task-due-date)

**Missing tests:**

| Category | Missing Tests | Priority |
|----------|---------------|----------|
| Repositories | CandidateRepository, CandidateTaskRepository, TemplateRepository, CommentRepository, SearchRepository, all organizational repos | High |
| Services | CandidateService, TemplateService, TemplateExpansionService, UserService | High |
| Integration | Route integration tests for all 10 route files | Medium |

---

## Risk Assessment

### High Risk Areas

| Area | Risk | Mitigation |
|------|------|------------|
| **Template Expansion** | Complex transactional logic with 7 repositories | ✅ Already extracted to TemplateExpansionService |
| **Candidate Status Transitions** | Business rules for status cascade | Create CandidateStatusService with comprehensive tests |
| **Authorization Scope Filtering** | Security vulnerabilities if broken | Ensure all routes use AuthorizationService consistently |
| **Due Date Calculations** | Complex anchor resolution | Already in date.utils.ts, well-tested |
| **Database Transactions** | Data corruption risk | Use explicit transaction boundaries in services |

### Medium Risk Areas

| Area | Risk | Mitigation |
|------|------|------------|
| Route migration | Breaking changes | Incremental migration, maintain backward compatibility |
| Service injection | Circular dependencies | Use factory pattern (already implemented) |
| Test coverage gaps | Regressions | Write tests before migration |

---

## Implementation Order Recommendation

Based on dependency analysis and risk assessment:

```
Week 1:
├── Day 1: Complete ServiceFactory with all repositories
├── Day 2: Create missing services (CandidateStatusService, NotificationService, UserInvitationService)
├── Day 3: Migrate reference-data.routes.ts and search.routes.ts (lowest risk)
├── Day 4: Migrate organizations.routes.ts and settings.routes.ts
├── Day 5: Migrate notifications.routes.ts and auth.routes.ts

Week 2:
├── Day 6: Migrate users.routes.ts (complex due to roles/scopes)
├── Day 7: Migrate templates.routes.ts (uses TemplateExpansionService)
├── Day 8: Migrate tasks.routes.ts and candidates.routes.ts (most complex)
├── Day 9: Convert storage.ts to pure facade
├── Day 10: Add deprecation warnings, write missing tests
```

---

## Success Metrics

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| storage.ts LOC | 3,744 | <300 | ❌ |
| Routes using storage directly | 10/10 | 0/10 | ❌ |
| Routes using services | 2/10 (partial) | 10/10 | ⚠️ |
| Repository test coverage | ~20% | 85% | ❌ |
| Service test coverage | ~30% | 80% | ❌ |
| Overall test coverage | Unknown | 80% | ❓ |

---

## Questions Before Proceeding

1. **Priority Focus:** Would you like to start with:
   - (a) Completing the service factory and creating missing services?
   - (b) Migrating the simplest routes first (reference-data, search)?
   - (c) Converting storage.ts to a facade first?

2. **Testing Strategy:** Do you want:
   - (a) Tests written before each migration step (TDD)?
   - (b) Tests written after migration for validation?
   - (c) Focus on integration tests only?

3. **Breaking Changes:** Are you okay with:
   - (a) Deprecation warnings in logs during transition?
   - (b) Hard removal of storage methods once routes are migrated?

4. **Timeline:** Is the 2-week timeline acceptable, or do you need this faster/slower?

---

## Appendix: File Inventory

### Current Repository Structure

```
server/repositories/
├── base/
│   ├── BaseRepository.ts
│   ├── index.ts
│   └── types.ts
├── candidates/
│   ├── CandidateFollowerRepository.ts
│   ├── CandidateRepository.ts
│   ├── CandidateStageRepository.ts
│   ├── CandidateTaskRepository.ts
│   └── index.ts
├── organizational/
│   ├── DepartmentRepository.ts
│   ├── DivisionRepository.ts
│   └── index.ts
├── reference/
│   ├── HiringStageRepository.ts
│   ├── ReferenceDataRepository.ts
│   ├── TaskDefinitionRepository.ts
│   └── index.ts
├── templates/
│   ├── TemplateRepository.ts
│   ├── TemplateStageRepository.ts
│   ├── TemplateTaskRepository.ts
│   └── index.ts
├── users/
│   ├── InvitationRepository.ts
│   ├── UserIdentityRepository.ts
│   ├── UserPreferencesRepository.ts
│   ├── UserRepository.ts
│   └── index.ts
├── CommentRepository.ts
├── NotificationRepository.ts
└── SearchRepository.ts
```

### Current Service Structure

```
server/services/
├── authorization/
│   ├── AuthorizationService.ts
│   ├── CandidatePolicy.ts
│   ├── TaskPolicy.ts
│   ├── index.ts
│   └── policy-types.ts
├── candidates/
│   └── candidate.service.ts
├── tasks/
│   ├── index.ts
│   ├── task-due-date.service.ts
│   └── task.service.ts
├── templates/
│   ├── index.ts
│   ├── template-estimation.service.ts
│   ├── template-expansion.service.ts
│   └── template.service.ts
├── users/
│   └── user.service.ts
└── service-factory.ts
```

### Current Route Structure

```
server/routes/
├── auth.routes.ts
├── candidates.routes.ts
├── docs.ts
├── health.ts
├── index.ts
├── notifications.routes.ts
├── organizations.routes.ts
├── reference-data.routes.ts
├── search.routes.ts
├── settings.routes.ts
├── tasks.routes.ts
├── templates.routes.ts
└── users.routes.ts
```

### Current Utility Structure

```
server/utils/
├── app-url.ts (28 LOC)
├── authorization.utils.ts (208 LOC)
├── business-day.utils.ts (60 LOC)
├── date.utils.ts (111 LOC)
├── envelope.ts (135 LOC)
├── error-handler.ts (138 LOC)
├── hiring-phase.utils.ts (226 LOC)
├── invitation.utils.ts (37 LOC)
├── mention-key.utils.ts (109 LOC)
├── notification.utils.ts (171 LOC)
├── preferences.utils.ts (82 LOC)
├── sanitization.utils.ts (70 LOC)
└── secret.ts (67 LOC)
Total: 1,442 LOC
```

---

**Document Version:** 1.0  
**Created:** December 4, 2025  
**Next Review:** After approval of implementation approach
