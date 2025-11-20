# Bounded Contexts Documentation

**Purpose:** Define explicit boundaries between different domain contexts in OnBoardPro
**Date:** 2025-11-20
**Status:** Active Architecture Documentation

---

## Overview

OnBoardPro is organized into **four bounded contexts**, each representing a distinct subdomain with its own models, business rules, and ubiquitous language. These contexts integrate through well-defined interfaces (repositories and domain events) rather than direct coupling.

```
┌─────────────────────────────────────────────────────────────┐
│                     OnBoardPro System                        │
│                                                              │
│  ┌──────────────────┐    ┌──────────────────┐              │
│  │    Candidate     │◄──►│      Task        │              │
│  │   Management     │    │   Management     │              │
│  └──────────────────┘    └──────────────────┘              │
│           ▲                       ▲                          │
│           │                       │                          │
│           ▼                       ▼                          │
│  ┌──────────────────┐    ┌──────────────────┐              │
│  │    Template      │    │      User        │              │
│  │   Management     │    │   Management     │              │
│  └──────────────────┘    └──────────────────┘              │
│                                                              │
│         ▲──────────── Domain Events ──────────►             │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. Candidate Management Context

### Purpose
Manage candidates through the hiring pipeline from application to onboarding.

### Aggregate Root
**Candidate** - The primary entity representing a job candidate.

### Entities & Value Objects
- **Candidate** (Aggregate Root)
  - Properties: firstName, lastName, email, status, currentStageId
  - Lifecycle: created → active → hired/rejected → archived
- **CandidateFollower** - Users who follow a candidate for updates
- **CandidateStageHistory** - Audit trail of stage transitions

### Ubiquitous Language

| Term | Meaning in This Context |
|------|------------------------|
| **Candidate** | A person being considered for employment |
| **Stage** | A step in the hiring pipeline (e.g., "Phone Screen", "On-site Interview") |
| **Primary Owner** | The HR staff member responsible for this candidate |
| **Follower** | A user subscribed to updates about this candidate |
| **Template Application** | Applying a pre-defined workflow to a candidate |
| **Stage Progression** | Moving a candidate forward through hiring stages |
| **Stage Regression** | Moving a candidate backward (e.g., if requirements not met) |
| **Anchor Date** | Key dates: offer letter issued/accepted, anticipated start date |

### Business Rules

1. **Email Uniqueness**: A candidate email must be unique within a department
2. **Template Application**: Once applied, a template cannot be changed
3. **Stage Transitions**: Candidates can only move to adjacent stages (or skip under special conditions)
4. **Ownership**: Every candidate must have a primary owner
5. **Archive Integrity**: Archived candidates cannot be modified except to restore

### Domain Events Published

```typescript
- candidate.created        // When a new candidate is created
- candidate.updated        // When candidate details change
- candidate.status_changed // When status changes (active/archived/hired)
- candidate.stage_changed  // When candidate moves between stages
- template.applied         // When a template is applied to a candidate
```

### Integration Points

**Consumes From:**
- **Template Management**: Via `TemplateRepository.getTemplate()` to apply templates
- **Task Management**: Via events to know when all tasks complete (triggers stage advancement)

**Provides To:**
- **Task Management**: Candidate ID for task assignment
- **User Management**: Candidate linking to user account

### Service Layer
- **CandidateService** (`server/services/candidates/candidate.service.ts`)
  - `createCandidate()` - Validate and create with duplicate checking
  - `updateCandidate()` - Update with business rule enforcement
  - `getCandidate()` / `getCandidates()` - Query operations
  - `applyTemplate()` - Apply workflow template to candidate

### Data Access Layer
- **CandidateRepository** (`server/repositories/candidates/CandidateRepository.ts`)
- **CandidateFollowerRepository**
- **CandidateTaskRepository** (bridging to Task context)

### Routes
- `server/routes/candidates.routes.ts`

---

## 2. Task Management Context

### Purpose
Manage tasks, assignments, and completion tracking for candidates.

### Aggregate Root
**Task** - A unit of work to be completed during candidate processing.

### Entities & Value Objects
- **Task** (Aggregate Root)
  - Properties: title, status, assigneeUserId, dueAt, completedAt
  - Statuses: pending → in_progress → done | canceled
- **TaskDefinition** - Reusable task templates (catalog)
- **TaskAssignment** - Represented by assigneeKind, assigneeUserId, assigneeRole

### Ubiquitous Language

| Term | Meaning in This Context |
|------|------------------------|
| **Task** | A specific work item assigned to complete for a candidate |
| **Task Definition** | A reusable template for creating tasks |
| **Assignee** | The person responsible for completing the task |
| **Assignment Kind** | Type of assignment: 'user' (specific person) or 'role' (role-based) |
| **Due Date** | The deadline for task completion |
| **Required Task** | A task that must be completed before stage advancement |
| **Task Status** | Current state: pending, in_progress, done, canceled |
| **Overdue** | Task completed after its due date |
| **Cancel Reason** | Required explanation when canceling a task |

### Business Rules

1. **Required Task Enforcement**: Required tasks block stage advancement until completed
2. **Cancellation Rules**: Only HR staff or system admins can cancel required tasks
3. **Assignment Resolution**: Tasks assigned to "candidate.self" resolve when candidate links to user
4. **Status Transitions**: Tasks must follow valid status transition paths
5. **Completion Tracking**: Done tasks must have completedAt timestamp
6. **Overdue Detection**: System tracks if task completed after due date

### Domain Events Published

```typescript
- task.created           // When a new task is created
- task.assigned          // When a task is assigned/reassigned to a user
- task.status_changed    // When task status changes
- task.completed         // When task status changes to 'done'
```

### Integration Points

**Consumes From:**
- **Candidate Management**: Candidate ID to associate tasks
- **User Management**: User IDs for task assignment

**Provides To:**
- **Candidate Management**: Via events when all required tasks complete (triggers stage advancement)
- **User Management**: Task counts for user workload

### Service Layer
- **TaskService** (`server/services/tasks/task.service.ts`)
  - `createTask()` - Create with validation and event publishing
  - `updateTask()` - Update with status transition rules
  - `completeTask()` - Mark as done with completion tracking
  - `archiveTask()` - Soft delete
  - `getTasks()` - Query with filtering

### Data Access Layer
- **CandidateTaskRepository** (`server/repositories/candidates/CandidateTaskRepository.ts`)

### Routes
- `server/routes/tasks.routes.ts`

---

## 3. Template Management Context

### Purpose
Define and manage reusable hiring workflow templates.

### Aggregate Root
**Template** - A reusable workflow definition for candidate processing.

### Entities & Value Objects
- **Template** (Aggregate Root)
  - Properties: name, description, isActive, candidateTypeId
  - States: draft → active → archived
- **TemplateStage** - A stage included in this template
- **TemplateTask** - A task definition to be created when template is applied
- **DueRuleType** - How task due dates are calculated (relative to dates)

### Ubiquitous Language

| Term | Meaning in This Context |
|------|------------------------|
| **Template** | A reusable workflow definition |
| **Template Stage** | A stage included in the template's workflow |
| **Template Task** | A task definition (not an actual task instance) |
| **Template Activation** | Making a template available for use |
| **Template Readiness** | Whether a template can be activated (must have stages) |
| **Template Cloning** | Creating a copy of an existing template |
| **Due Rule Type** | How to calculate task due dates (e.g., "days_after_start") |
| **Phase** | Pre-hire vs. onboarding distinction |
| **Order Index** | Sequence of stages in the workflow |

### Business Rules

1. **Activation Requirements**: A template must have at least one stage to be activated
2. **Stage Task Requirements**: Each stage must have at least one task (enforced by trigger)
3. **Immutability When Applied**: Once applied to candidates, templates shouldn't change (versioning)
4. **Clone Inheritance**: Cloned templates start as inactive drafts
5. **Archive Cascade**: Archiving a template doesn't affect candidates using it

### Domain Events Published

```typescript
- template.created       // When a new template is created
- template.updated       // When template is modified
- template.cloned        // When a template is cloned
- template.activated     // When template is set to active
- template.deactivated   // When template is set to draft/inactive
```

### Integration Points

**Consumes From:**
- None (Template context is self-contained)

**Provides To:**
- **Candidate Management**: Templates for application to candidates
- **Task Management**: Task definitions when template is applied

### Service Layer
- **TemplateService** (`server/services/templates/template.service.ts`)
  - `createTemplate()` - Create with optional cloning
  - `updateTemplate()` - Update with validation
  - `activateTemplate()` - Activate with readiness check
  - `deactivateTemplate()` - Set to draft status
  - `checkTemplateReadiness()` - Validate activation requirements
  - `cloneTemplate()` - Create a copy

### Data Access Layer
- **TemplateRepository** (`server/repositories/templates/TemplateRepository.ts`)
- **TemplateStageRepository**
- **TemplateTaskRepository**

### Routes
- `server/routes/templates.routes.ts`

---

## 4. User Management Context

### Purpose
Manage users, authentication, authorization, and user preferences.

### Aggregate Root
**User** - A person who uses the system.

### Entities & Value Objects
- **User** (Aggregate Root)
  - Properties: email, passwordHash, role, status, departmentId
  - Roles: system_admin, hr_staff, department_admin, division_leader, manager, candidate
- **UserRole** - Role assignment (users can have multiple roles)
- **UserPreferences** - User-specific settings
- **UserIdentity** - Multi-provider authentication identities

### Ubiquitous Language

| Term | Meaning in This Context |
|------|------------------------|
| **User** | A person with system access |
| **Role** | A set of permissions (system_admin, hr_staff, etc.) |
| **Multi-Role** | A user can have multiple roles assigned |
| **User Status** | active, inactive, archived |
| **User Preferences** | Settings like notification preferences, task filters |
| **Password Hashing** | Using scrypt to securely store passwords |
| **User Disable** | Deactivating a user account (with task reassignment) |
| **User Enable** | Reactivating a previously disabled account |
| **Task Reassignment** | Transferring open tasks when disabling a user |

### Business Rules

1. **Email Uniqueness**: User email must be unique across the system
2. **Password Security**: Passwords hashed with scrypt before storage
3. **Role Validation**: Roles must be from the valid role enum
4. **Task Reassignment on Disable**: When disabling a user, open tasks must be handled
5. **Preference Scoping**: Only certain preferences available per role
6. **Multi-Provider Auth**: Users can authenticate via local, LDAP, or OAuth

### Domain Events Published

```typescript
- user.created           // When a new user is created
- user.role_changed      // When user roles are modified
- user.disabled          // When user account is disabled
- user.enabled           // When user account is enabled
```

### Integration Points

**Consumes From:**
- **Task Management**: Task counts and reassignment operations

**Provides To:**
- **All Contexts**: User IDs for assignment, ownership, audit trails
- **Candidate Management**: User linking for candidate self-service

### Service Layer
- **UserService** (`server/services/users/user.service.ts`)
  - `createUser()` - Create with duplicate checking and password hashing
  - `updateUser()` - Update with password hashing if provided
  - `updateUserRoles()` - Role management with event publishing
  - `disableUser()` - Disable with task reassignment
  - `enableUser()` - Reactivate account
  - `getUserPreferences()` / `upsertUserPreferences()` - Preference management

### Data Access Layer
- **UserRepository** (`server/repositories/users/UserRepository.ts`)

### Routes
- `server/routes/users.routes.ts`

---

## Cross-Context Integration Patterns

### 1. Repository Integration (Synchronous)

Contexts integrate by calling repositories from other contexts **without going through services**. This keeps contexts loosely coupled.

```typescript
// CandidateService needs to check if a template exists
export class CandidateService {
  constructor(
    private candidateRepo: CandidateRepository,
    private templateRepo: TemplateRepository  // ← Integration point
  ) {}

  async applyTemplate(candidateId: string, templateId: string) {
    // Check template exists (cross-context call via repository)
    const template = await this.templateRepo.getTemplate(templateId);
    if (!template) {
      throw new Error('Template not found');
    }

    // Apply template logic here
  }
}
```

**Why Repository, Not Service?**
- Services contain business logic for their own context
- Repositories provide read access to other contexts' data
- Prevents circular dependencies between services

### 2. Domain Events (Asynchronous)

Contexts publish events that other contexts can subscribe to **without knowing who's listening**.

```typescript
// Task Management publishes event
await eventBus.publish(taskCompleted(taskId, {
  candidateId: task.candidateId,
  taskTitle: task.title,
  completedBy: userId
}));

// Candidate Management listens (in a handler)
eventBus.subscribe('task.completed', async (event) => {
  // Check if all tasks complete, advance stage
  await advanceStageIfComplete(event.payload.candidateId);
});
```

**Benefits:**
- Loose coupling - publishers don't know subscribers
- Temporal decoupling - events processed asynchronously
- Easy to add new integrations without modifying existing code

### 3. Anti-Corruption Layers (Future)

If contexts diverge significantly, add adapters to translate between them:

```typescript
// TaskAdapter - translates between contexts
class CandidateToTaskAdapter {
  toCandidateReference(candidate: Candidate): TaskCandidateView {
    return {
      candidateId: candidate.id,
      candidateName: `${candidate.firstName} ${candidate.lastName}`,
      // Only expose what Task context needs
    };
  }
}
```

---

## Context Map

Visual representation of how contexts relate:

```
┌───────────────────────────────────────────────────────────────┐
│                     Context Relationships                      │
└───────────────────────────────────────────────────────────────┘

Candidate Management ──[reads from]──> Template Management
    │
    │ [publishes events]
    │
    ▼
Task Management ──[publishes events]──> Candidate Management
    │
    │ [reads from]
    │
    ▼
User Management ◄──[reads from]──── All Contexts


Legend:
─[reads from]─>      : Repository call (synchronous)
─[publishes events]─>: Domain events (asynchronous)
◄─[reads from]─      : Provides data to other contexts
```

### Relationship Types

| From Context | To Context | Type | Integration Mechanism |
|-------------|-----------|------|----------------------|
| Candidate | Template | **Customer-Supplier** | Repository calls |
| Task | Candidate | **Published Language** | Domain events |
| All | User | **Shared Kernel** | User IDs used everywhere |
| Candidate | Task | **Partnership** | Bi-directional via events |

---

## Future Improvements

### 1. Physical Separation (Optional)

Consider reorganizing directory structure to make contexts explicit:

```
/server/contexts/
  candidate-management/
    services/
      candidate.service.ts
    repositories/
      CandidateRepository.ts
    routes/
      candidates.routes.ts
    domain/
      events/
        CandidateCreatedEvent.ts
      types.ts

  task-management/
    services/
    repositories/
    routes/
    domain/

  template-management/
    ...

  user-management/
    ...
```

**Pros:**
- Makes bounded contexts visually obvious
- Clear ownership of code
- Easy to extract into microservices if needed

**Cons:**
- Large refactoring effort
- May disrupt ongoing work
- Current `/server/services/` structure already works well

**Recommendation:** Document first (this file), reorganize later if needed.

### 2. Context Validation Tests

Add tests that enforce context boundaries:

```typescript
describe('Bounded Context Integrity', () => {
  it('CandidateService should not import from TaskService', () => {
    // Static analysis to prevent service-to-service coupling
  });

  it('All cross-context integration should use repositories or events', () => {
    // Verify no direct service calls across contexts
  });
});
```

### 3. Explicit Context Interfaces

Define clear interfaces for what each context exposes:

```typescript
// ICandidateContext - Public API
export interface ICandidateContext {
  // Only expose what other contexts need
  getCandidateById(id: string): Promise<Candidate>;
  applyTemplateToCandidate(candidateId: string, templateId: string): Promise<void>;
}
```

---

## Architectural Decision Records

The following ADRs support this bounded context design:

- **ADR-012**: [To be created] Bounded Context Boundaries
- **ADR-013**: [To be created] Cross-Context Integration Patterns
- **ADR-014**: [To be created] Service-to-Service Communication Rules

---

## Maintenance

**Review Schedule:** Quarterly
**Owner:** Development Team
**Last Updated:** 2025-11-20

**Change Process:**
1. Propose context boundary changes in architecture review
2. Update this document
3. Create migration plan if moving code between contexts
4. Update tests and documentation

---

## References

- [Domain-Driven Design by Eric Evans](https://www.domainlanguage.com/ddd/)
- [Implementing Domain-Driven Design by Vaughn Vernon](https://www.informit.com/store/implementing-domain-driven-design-9780321834577)
- [ARCHITECTURE_REVIEW.md](./ARCHITECTURE_REVIEW.md) - Original architecture assessment
- [Service Layer Documentation](../server/services/README.md) - Service implementation details
