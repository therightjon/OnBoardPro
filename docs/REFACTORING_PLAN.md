# Priority 1 Refactoring Plan: Architecture Decomposition

## Executive Summary

This document outlines the detailed plan to decompose the monolithic `routes.ts` (3,023 LOC) and `storage.ts` (3,592 LOC) files into a clean, maintainable architecture following industry best practices.

**Goals:**
1. ✅ Decompose routes.ts into feature-based route modules (<300 LOC each)
2. ✅ Split storage.ts into repository classes following repository pattern
3. ✅ Implement comprehensive service layer for business logic
4. ✅ Increase test coverage to 80%

**Timeline:** 4-6 days
**Risk Level:** Medium-High (requires careful migration, extensive testing)

---

## Current State Analysis

### routes.ts - 3,023 Lines
- **97 total routes** across 10 feature areas
- **20+ helper functions** mixed with route definitions
- **84 unique storage methods** called directly from routes
- **Complex authorization logic** embedded in routes
- **Notification logic** scattered throughout

### storage.ts - 3,592 Lines
- **84 unique methods** across 18 entity groups
- **Simple CRUD:** ~60 methods
- **Medium complexity:** ~20 methods (joins, filtering)
- **High complexity:** ~15 methods (complex queries, aggregations)
- **Very high complexity:** 5 methods (template expansion, estimation, status management)

---

## Proposed Architecture

```
server/
├── routes/
│   ├── index.ts                      # Router aggregator (new)
│   ├── auth.routes.ts                # 7 routes - Authentication
│   ├── candidates.routes.ts          # 16 routes - Candidates
│   ├── tasks.routes.ts               # 9 routes - Tasks
│   ├── templates.routes.ts           # 19 routes - Templates
│   ├── users.routes.ts               # 13 routes - Users
│   ├── organizations.routes.ts       # 10 routes - Depts/Divisions
│   ├── settings.routes.ts            # 5 routes - System settings
│   ├── notifications.routes.ts       # 5 routes - Notifications
│   ├── search.routes.ts              # 4 routes - Search/dashboard
│   └── reference-data.routes.ts      # 9 routes - Reference data
│
├── services/                         # NEW - Business logic layer
│   ├── candidates/
│   │   ├── candidate.service.ts      # Candidate business logic
│   │   ├── candidate-status.service.ts
│   │   └── candidate-notification.service.ts
│   ├── tasks/
│   │   ├── task.service.ts
│   │   └── task-notification.service.ts
│   ├── templates/
│   │   ├── template.service.ts
│   │   ├── template-expansion.service.ts
│   │   └── template-estimation.service.ts
│   ├── users/
│   │   ├── user.service.ts
│   │   └── user-invitation.service.ts
│   └── shared/
│       ├── authorization.service.ts
│       └── notification.service.ts
│
├── repositories/                     # NEW - Data access layer
│   ├── base/
│   │   ├── BaseRepository.ts
│   │   └── types.ts
│   ├── users/
│   │   ├── UserRepository.ts
│   │   ├── UserIdentityRepository.ts
│   │   ├── UserPreferencesRepository.ts
│   │   └── InvitationRepository.ts
│   ├── candidates/
│   │   ├── CandidateRepository.ts
│   │   ├── CandidateTaskRepository.ts
│   │   ├── CandidateStageRepository.ts
│   │   └── CandidateFollowerRepository.ts
│   ├── templates/
│   │   ├── TemplateRepository.ts
│   │   ├── TemplateTaskRepository.ts
│   │   └── TemplateStageRepository.ts
│   ├── organizational/
│   │   ├── DepartmentRepository.ts
│   │   └── DivisionRepository.ts
│   ├── reference/
│   │   ├── HiringStageRepository.ts
│   │   ├── TaskDefinitionRepository.ts
│   │   └── ReferenceDataRepository.ts
│   ├── CommentRepository.ts
│   ├── NotificationRepository.ts
│   └── SearchRepository.ts
│
└── utils/
    ├── authorization.utils.ts        # Auth helper functions
    ├── notification.utils.ts         # Notification helpers
    ├── sanitization.utils.ts         # Data sanitization
    ├── preferences.utils.ts          # User preferences
    ├── invitation.utils.ts           # Invitation helpers
    ├── date.utils.ts                 # Date calculations
    ├── business-day.utils.ts         # Business day logic
    └── mention-key.utils.ts          # Mention key generation
```

---

## Implementation Phases

### Phase 1: Foundation & Utilities (Day 1)
**Goal:** Extract utilities and create base infrastructure
**Risk:** Low
**Testing Required:** Unit tests for utilities

#### 1.1 Extract Utility Functions
- Create `server/utils/date.utils.ts`
  - Move: `normalizeToUtcDate`, `addDays`, `ensureDate`
  - Move: `resolveLooAnchor`, `resolveStartAnchor`, `computeDueFromRule`
- Create `server/utils/business-day.utils.ts`
  - Move: `addBusinessDays`, `countBusinessDays`
- Create `server/utils/mention-key.utils.ts`
  - Move: `sanitizeMentionKey`, `generateMentionKey`, `ensureUniqueMentionKey`
- Create `server/utils/authorization.utils.ts`
  - Move: `isAppRole`, `collectUserRoles`, `hasAnyRole`, `hasPrivilegedRole`
  - Move: `requirePrivileges`, `logAuthorizationFailure`
  - Move: `fetchCandidateWithAccess`, `fetchTaskWithAccess`, `fetchTemplateWithAccess`
- Create `server/utils/sanitization.utils.ts`
  - Move: `sanitizeCandidateForCandidateUser`, `sanitizeTaskForCandidateUser`
- Create `server/utils/preferences.utils.ts`
  - Move: `getAllowedPreferenceKeys`, `buildPreferenceResponse`
  - Move: `pickPreferencesForRole`, `filterUpdatesForRole`
- Create `server/utils/invitation.utils.ts`
  - Move: `generateInviteToken`, `getInviteBaseUrl`, `sendInviteEmail`
- Create `server/utils/notification.utils.ts`
  - Move: `gatherCandidateNotificationContext`, `gatherCandidateAssigneeIds`
  - Move: `notifyTaskAssignees`, `notifyCandidateStageChange`
  - Move: `buildActorLabel`, `buildCommentSnippet`

**Tests:**
- `server/tests/utils/date.utils.test.ts`
- `server/tests/utils/business-day.utils.test.ts`
- `server/tests/utils/authorization.utils.test.ts`
- `server/tests/utils/preferences.utils.test.ts`

#### 1.2 Create Base Repository Infrastructure
- Create `server/repositories/base/BaseRepository.ts`
  - Cursor encoding/decoding
  - Common query helpers
  - Shared transaction methods
- Create `server/repositories/base/types.ts`
  - `AuthorizationContext` type
  - `CandidateScopeFilters` type
  - Common filter types
  - Pagination types

**Tests:**
- `server/tests/repositories/base/BaseRepository.test.ts`

---

### Phase 2: Simple Repositories (Day 1-2)
**Goal:** Extract simple CRUD repositories
**Risk:** Low
**Testing Required:** Unit tests for each repository

#### 2.1 Reference Data Repositories
- `server/repositories/reference/HiringStageRepository.ts`
  - Methods: `getAll`, `create`, `update`, `delete`
- `server/repositories/reference/TaskDefinitionRepository.ts`
  - Methods: `getAll`, `getById`, `create`, `update`
- `server/repositories/reference/ReferenceDataRepository.ts`
  - Methods: `getTaskCategories`, `getTaskPriorities`
  - Methods: `getCandidateTypes`, `getFacultyRanks`

**Tests:**
- `server/tests/repositories/reference/*.test.ts`

#### 2.2 Organizational Repositories
- `server/repositories/organizational/DepartmentRepository.ts`
  - Methods: `getAll`, `getById`, `create`, `update`, `archive`, `restore`
- `server/repositories/organizational/DivisionRepository.ts`
  - Methods: `getAll`, `getById`, `getByDepartment`, `create`, `update`, `archive`, `restore`

**Tests:**
- `server/tests/repositories/organizational/*.test.ts`

#### 2.3 Standalone Repositories
- `server/repositories/CommentRepository.ts`
  - Methods: `getCandidateComments`, `getTaskComments`
  - Methods: `create`, `edit`, `delete`, `getStats`
- `server/repositories/NotificationRepository.ts`
  - Methods: `getNotifications`, `markRead`, `markAllRead`
- `server/repositories/SearchRepository.ts`
  - Methods: `searchDepartments`, `searchDivisions`, `searchUsers`

**Tests:**
- `server/tests/repositories/*.test.ts`

---

### Phase 3: User Repositories (Day 2)
**Goal:** Extract user-related repositories
**Risk:** Medium (multi-provider auth complexity)
**Testing Required:** Unit + integration tests

#### 3.1 User Repositories
- `server/repositories/users/UserRepository.ts`
  - Methods: `getById`, `getByEmail`, `getByUsername`
  - Methods: `create`, `update`, `disable`, `enable`
  - Methods: `getAll`, `getRoles`, `setRoles`, `addRoles`
  - Methods: `getDepartmentScopes`, `getDivisionScopes`, `getCandidateScopes`
  - Methods: `updateLastLogin`, `getOpenTaskCount`
- `server/repositories/users/UserIdentityRepository.ts`
  - Methods: `getByProvider`, `create`, `update`, `delete`
  - Methods: `getAllForUser`
- `server/repositories/users/UserPreferencesRepository.ts`
  - Methods: `get`, `upsert`
- `server/repositories/users/InvitationRepository.ts`
  - Methods: `create`, `getByToken`, `consume`
  - Methods: `findValidPending`, `getPendingForUsersList`

**Tests:**
- `server/tests/repositories/users/*.test.ts`
- Integration tests for multi-provider auth flow

---

### Phase 4: Template Repositories (Day 2-3)
**Goal:** Extract template-related repositories
**Risk:** Medium (template expansion complexity)
**Testing Required:** Unit + integration tests

#### 4.1 Template Repositories
- `server/repositories/templates/TemplateRepository.ts`
  - Methods: `getAll`, `getById`, `create`, `update`, `archive`
  - Methods: `getReadiness`, `clone`
- `server/repositories/templates/TemplateTaskRepository.ts`
  - Methods: `getAll`, `getById`, `getByTemplate`, `create`, `update`, `archive`
- `server/repositories/templates/TemplateStageRepository.ts`
  - Methods: `getAll`, `getById`, `getByTemplate`, `create`, `update`, `delete`
  - Methods: `reorder`

**Tests:**
- `server/tests/repositories/templates/*.test.ts`

---

### Phase 5: Candidate Repositories (Day 3)
**Goal:** Extract candidate-related repositories
**Risk:** High (complex authorization, many relationships)
**Testing Required:** Extensive unit + integration tests

#### 5.1 Candidate Repositories
- `server/repositories/candidates/CandidateRepository.ts`
  - Methods: `getAll`, `getById`, `create`, `update`
  - Methods: `updateStatus`, `getDivisionActiveCounts`
  - Authorization: Implement scope filtering
- `server/repositories/candidates/CandidateTaskRepository.ts`
  - Methods: `getAll`, `getById`, `getByCandidateId`, `create`, `update`
  - Methods: `delete`, `archive`, `resolveSelfAssignments`
  - Methods: `getDashboardTasks`
- `server/repositories/candidates/CandidateStageRepository.ts`
  - Methods: `getStageHistory`, `getTemplateStages`
  - Methods: `createTemplateStage`, `upsertTemplateStages`
- `server/repositories/candidates/CandidateFollowerRepository.ts`
  - Methods: `getFollowers`, `addFollower`, `removeFollower`

**Tests:**
- `server/tests/repositories/candidates/*.test.ts`
- Authorization tests for scope filtering

---

### Phase 6: Service Layer (Day 3-4)
**Goal:** Implement business logic services
**Risk:** High (complex business rules)
**Testing Required:** Comprehensive unit + integration tests

#### 6.1 Template Services
- `server/services/templates/template.service.ts`
  - Business logic for template CRUD
  - Validation logic
- `server/services/templates/template-expansion.service.ts`
  - Move: `expandTemplate` logic from storage
  - Template application to candidates
  - Task creation and due date calculation
- `server/services/templates/template-estimation.service.ts`
  - Move: `estimateTemplate`, `estimateCandidate` logic
  - Timeline estimation algorithms

#### 6.2 Candidate Services
- `server/services/candidates/candidate.service.ts`
  - Candidate CRUD business logic
  - Validation and business rules
- `server/services/candidates/candidate-status.service.ts`
  - Move: Status transition logic
  - Task cascade operations
- `server/services/candidates/candidate-notification.service.ts`
  - Stage change notifications
  - Owner change notifications
  - Follower notifications

#### 6.3 Task Services
- `server/services/tasks/task.service.ts`
  - Task CRUD business logic
  - Due date recalculation
  - Stage advancement (already exists: `advance-stage.service.ts`)
- `server/services/tasks/task-notification.service.ts`
  - Assignee notifications
  - Deadline notifications

#### 6.4 User Services
- `server/services/users/user.service.ts`
  - User management business logic
  - Role assignment validation
- `server/services/users/user-invitation.service.ts`
  - Invitation creation and sending
  - Invitation acceptance flow

#### 6.5 Shared Services
- `server/services/shared/authorization.service.ts`
  - Centralized authorization logic
  - Scope resolution
  - Access checking
- `server/services/shared/notification.service.ts`
  - Centralized notification creation
  - Mention resolution
  - Notification routing

**Tests:**
- `server/tests/services/**/*.test.ts`
- Integration tests for complex workflows

---

### Phase 7: Route Decomposition (Day 4-5)
**Goal:** Split routes.ts into feature-based modules
**Risk:** Medium (routing configuration)
**Testing Required:** Integration tests for all endpoints

#### 7.1 Simple Route Modules
- `server/routes/reference-data.routes.ts` (9 routes)
  - Hiring stages, task categories, priorities
  - Candidate types, faculty ranks
  - Task definitions
- `server/routes/organizations.routes.ts` (10 routes)
  - Departments CRUD
  - Divisions CRUD
- `server/routes/settings.routes.ts` (5 routes)
  - System settings
  - Email/SMTP settings

#### 7.2 Medium Complexity Route Modules
- `server/routes/search.routes.ts` (4 routes)
  - Department/division/user search
  - Dashboard data
- `server/routes/users.routes.ts` (13 routes)
  - User management
  - User preferences
- `server/routes/auth.routes.ts` (7 routes)
  - Invitations
  - Auth providers
  - LDAP configuration

#### 7.3 Complex Route Modules
- `server/routes/notifications.routes.ts` (5 routes)
  - Notifications (partially extracted already)
  - Comments
- `server/routes/templates.routes.ts` (19 routes)
  - Template management
  - Template stages and tasks
- `server/routes/tasks.routes.ts` (9 routes)
  - Task management
  - Task comments
- `server/routes/candidates.routes.ts` (16 routes)
  - Candidate management
  - Candidate tasks, stages, comments

#### 7.4 Router Aggregator
- `server/routes/index.ts`
  - Compose all route modules
  - Export single router
- Update `server/index.ts`
  - Import from `routes/index.ts`

**Tests:**
- `server/tests/api/**/*.test.ts` (update existing)
- End-to-end tests for critical flows

---

### Phase 8: Migration & Deprecation (Day 5)
**Goal:** Complete migration and remove old code
**Risk:** High (breaking changes)
**Testing Required:** Full regression testing

#### 8.1 Create Storage Facade
- `server/db/storage.ts` (keep as facade)
  - Implement IStorage interface using new repositories
  - Delegate all calls to appropriate repositories
  - Mark as deprecated

#### 8.2 Update Imports
- Update all service imports to use new structure
- Update all route imports to use new structure
- Update all test imports

#### 8.3 Remove Deprecated Code
- After full test suite passes:
  - Remove old routes.ts logic (keep only export)
  - Remove old storage.ts logic (keep only facade)
  - Update all documentation

**Tests:**
- Full regression test suite
- Load testing to verify performance
- Manual testing of critical flows

---

### Phase 9: Test Coverage Enhancement (Day 6)
**Goal:** Achieve 80% test coverage
**Risk:** Low
**Testing Required:** All the tests!

#### 9.1 Repository Tests
- Unit tests for all repositories
- Mock database connections
- Test authorization filtering
- Test error handling

#### 9.2 Service Tests
- Unit tests for all services
- Mock repository dependencies
- Test business rule validation
- Test complex workflows (template expansion, status changes)

#### 9.3 Route Tests
- Integration tests for all endpoints
- Test authentication and authorization
- Test error responses
- Test input validation

#### 9.4 End-to-End Tests
- Candidate creation → template application → task completion → stage advancement
- User invitation → acceptance → role assignment
- Template cloning → modification → application
- Comment creation → mention resolution → notification

**Coverage Goals:**
- Repositories: 85%
- Services: 80%
- Routes: 75%
- Overall: 80%

---

### Phase 10: Documentation (Day 6)
**Goal:** Update all documentation
**Risk:** Low

#### 10.1 Architecture Documentation
- Update `docs/ARCHITECTURE.md`
  - New service layer
  - Repository pattern
  - Dependency flow diagram

#### 10.2 API Documentation
- Update `docs/API_EXAMPLES.md`
  - No API changes (backward compatible)
  - Internal structure notes

#### 10.3 Developer Guide
- Update `CONTRIBUTING.md`
  - How to add new routes
  - How to create repositories
  - How to implement services
  - Testing guidelines

#### 10.4 Migration Guide
- Create `docs/MIGRATION_GUIDE.md`
  - What changed
  - How to update custom code
  - Breaking changes (if any)

---

## Testing Strategy

### Unit Tests
- All repositories tested in isolation
- All services tested with mocked repositories
- All utilities tested independently

### Integration Tests
- Routes tested with real services and repositories
- Database integration tests
- Transaction boundary tests

### End-to-End Tests
- Critical user workflows
- Complex multi-step operations
- Authorization scenarios

### Performance Tests
- Query performance benchmarks
- Load testing for high-traffic endpoints
- Memory usage monitoring

---

## Risk Mitigation

### High-Risk Areas

#### 1. Template Expansion Logic
**Risk:** Complex stateful logic, hard to test
**Mitigation:**
- Extract to dedicated service first
- Comprehensive unit tests
- Integration tests with real database
- Manual testing of all scenarios

#### 2. Authorization & Scopes
**Risk:** Security vulnerabilities if broken
**Mitigation:**
- Dedicated authorization service
- Extensive authorization tests
- Security audit after migration
- Manual testing of all permission scenarios

#### 3. Database Transactions
**Risk:** Data corruption if transactions broken
**Mitigation:**
- Careful transaction boundary analysis
- Integration tests for all transactional operations
- Rollback testing

#### 4. Due Date Calculations
**Risk:** Complex business logic, easy to break
**Mitigation:**
- Extract to dedicated service
- Comprehensive unit tests with edge cases
- Compare results with old implementation

### Rollback Plan

If critical issues are discovered:
1. Keep old `storage.ts` as facade (backward compatible)
2. Can revert to old implementation by changing facade
3. Feature flags for gradual rollout of new services
4. Database schema unchanged (no rollback needed)

---

## Success Metrics

### Code Quality
- ✅ No file exceeds 500 LOC
- ✅ Average file size: 100-200 LOC
- ✅ Cyclomatic complexity: <10 per method
- ✅ Clear separation of concerns

### Test Coverage
- ✅ 80%+ overall test coverage
- ✅ 85%+ repository coverage
- ✅ 80%+ service coverage
- ✅ 100% critical path coverage

### Performance
- ✅ No regression in query performance
- ✅ No increase in memory usage
- ✅ Response times within 10% of baseline

### Developer Experience
- ✅ Clear file organization
- ✅ Easy to find code
- ✅ Simple to add new features
- ✅ Fast test execution

---

## Timeline Summary

| Phase | Days | Risk | Depends On |
|-------|------|------|------------|
| 1. Foundation & Utilities | 1 | Low | - |
| 2. Simple Repositories | 1 | Low | Phase 1 |
| 3. User Repositories | 1 | Medium | Phase 1-2 |
| 4. Template Repositories | 1 | Medium | Phase 1-2 |
| 5. Candidate Repositories | 1 | High | Phase 1-2 |
| 6. Service Layer | 1-2 | High | Phase 1-5 |
| 7. Route Decomposition | 1-2 | Medium | Phase 6 |
| 8. Migration & Deprecation | 1 | High | Phase 7 |
| 9. Test Coverage | 1 | Low | Phase 8 |
| 10. Documentation | 1 | Low | Phase 9 |

**Total: 4-6 days** (with one developer working full-time)

---

## Next Steps

1. Review and approve this plan
2. Create feature branch: `refactor/priority1-architecture`
3. Begin Phase 1: Foundation & Utilities
4. Commit frequently with small, focused changes
5. Maintain backward compatibility throughout
6. Run test suite after each phase

---

**Status:** Ready for implementation
**Last Updated:** 2025-11-19
