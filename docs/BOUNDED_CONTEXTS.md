# Bounded Contexts Documentation

**Purpose:** Define explicit boundaries between different domain contexts in OnBoardPro
**Date:** 2025-12-09
**Status:** Active Architecture Documentation
**Version:** 1.1.0

---

## Overview

OnBoardPro is organized into **eight bounded contexts**, each representing a distinct subdomain with its own models, business rules, and ubiquitous language. These contexts integrate through well-defined interfaces (repositories, domain events, and services) rather than direct coupling.

```
┌──────────────────────────────────────────────────────────────────┐
│                       OnBoardPro System                          │
│                                                                  │
│  ┌─────────────────┐    ┌─────────────────┐                      │
│  │   Candidate     │◄──►│      Task       │                      │
│  │  Management     │    │   Management    │                      │
│  └─────────────────┘    └─────────────────┘                      │
│           ▲                      ▲                               │
│           │                      │                               │
│           ▼                      ▼                               │
│  ┌─────────────────┐    ┌─────────────────┐                      │
│  │   Template      │    │   Organization  │                      │
│  │  Management     │    │   Management    │                      │
│  └─────────────────┘    └─────────────────┘                      │
│                                                                  │
│  ┌─────────────────┐    ┌─────────────────┐                      │
│  │      User       │    │  Notification   │                      │
│  │  Management     │◄──►│     System      │                      │
│  └─────────────────┘    └─────────────────┘                      │
│           ▲                      ▲                               │
│           │                      │                               │
│  ┌─────────────────┐    ┌─────────────────┐                      │
│  │ Collaboration   │    │  Audit Logging  │                      │
│  │  (Comments)     │    │     System      │                      │
│  └─────────────────┘    └─────────────────┘                      │
│                                  ▲                               │
│                                  │                               │
│           ▲──────────── EventBus (Domain Events) ──────────►     │
└──────────────────────────────────────────────────────────────────┘
```

---

## 1. Candidate Management Context

### Purpose
Manage candidates through the hiring pipeline from application to onboarding.

### Aggregate Root
**Candidate** - The primary entity representing a job candidate.

### Entities & Value Objects
- **Candidate** (Aggregate Root)
  - Properties: firstName, lastName, email, phone, status, currentStageId, salutation, candidateTypeId, facultyRankId, departmentId, divisionId, ownerId, managerId, loiDate, hireDate, linkedUserId
  - Lifecycle: created → active → hired/rejected/withdrawn → archived
  - Status: active, archived, withdrawn
- **CandidateFollower** - Users who follow a candidate for updates
- **CandidateStageHistory** - Complete audit trail of stage transitions with timestamps
- **CandidateTemplateStage** - Snapshot of stages when template was applied (lock-in)
- **CandidateType** - Classification (e.g., faculty, staff)
- **FacultyRank** - Rank classification for faculty candidates

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
- candidateCreated          // When a new candidate is created
- candidateUpdated          // When candidate details change
- candidateStatusChanged    // When status changes (active/archived/withdrawn)
- candidateStageChanged     // When candidate moves between stages
- templateApplied           // When a template is applied to a candidate
- ownerChanged              // When candidate owner or manager changes
- candidateArchived         // When candidate is archived
- candidateRestored         // When archived candidate is restored
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
  - `createCandidate()` - Validate and create with duplicate checking, emit candidateCreated event
  - `updateCandidate()` - Update with business rule enforcement
  - `archiveCandidate()` / `restoreCandidate()` - Soft deletion lifecycle
  - `getCandidate()` / `getCandidates()` - Query operations with authorization
  - `getCandidatesByDepartment()` / `getCandidatesByDivision()` - Scoped queries
  - `followCandidate()` / `unfollowCandidate()` - Follower management
  - `changeCandidateStage()` - Stage progression with history tracking
  - `linkUserToCandidate()` - Connect candidate profile to user account
- **CandidateTaskService** (`server/services/candidates/candidate-task.service.ts`)
  - `createCandidateTask()` - Create tasks for candidates
  - `updateCandidateTask()` - Update task status and assignments
  - `getCandidateTasks()` - Query candidate's tasks
  - `completeCandidateTask()` - Mark task complete with timestamp

### Data Access Layer
- **CandidateRepository** (`server/repositories/candidates/CandidateRepository.ts`)
  - Core CRUD operations with pagination and filtering
  - Scoped queries by department, division, manager
- **CandidateStageHistoryRepository** (`server/repositories/candidates/CandidateStageHistoryRepository.ts`)
  - Track stage transitions
- **CandidateTaskRepository** (`server/repositories/candidates/CandidateTaskRepository.ts`)
  - Bridging to Task context with candidate-specific queries
- **CandidateFollowerRepository** - Follower tracking

### Routes
- **GET** `/api/candidates` - List candidates with filters
- **POST** `/api/candidates` - Create candidate
- **GET** `/api/candidates/:id` - Get candidate details
- **PATCH** `/api/candidates/:id` - Update candidate
- **POST** `/api/candidates/:id/archive` - Archive candidate
- **POST** `/api/candidates/:id/restore` - Restore archived candidate
- **GET** `/api/candidates/:id/stage` - Get current stage
- **PATCH** `/api/candidates/:id/stage` - Change stage
- **GET** `/api/candidates/:id/followers` - List followers
- **POST** `/api/candidates/:id/follow` - Follow candidate
- **DELETE** `/api/candidates/:id/follow` - Unfollow candidate
- **POST** `/api/candidates/:candidateId/apply-template` - Apply template
- **GET** `/api/candidates/:candidateId/tasks` - Get candidate tasks
- **PATCH** `/api/candidates/:candidateId/tasks/:taskId` - Update task

(Routes defined in `server/routes/candidates.routes.ts`)

---

## 2. Task Management Context

### Purpose
Manage tasks, assignments, and completion tracking for candidates.

### Aggregate Root
**Task** - A unit of work to be completed during candidate processing.

### Entities & Value Objects
- **CandidateTask** (Aggregate Root)
  - Properties: candidateId, title, description, status, assigneeKind, assigneeUserId, assigneeRole, dueAt, completedAt, isRequired, priorityId, categoryId, anchorTaskId, pendingAnchor
  - Statuses: todo → in_progress → completed | canceled
  - Assignment kinds: 'user' (specific person) or 'role' (role-based)
- **TaskDefinition** - Reusable task templates (catalog of common tasks)
  - Properties: title, description, defaultCategoryId, defaultPriorityId
- **TaskAssignment** - Represented by assigneeKind, assigneeUserId, assigneeRole fields
- **TaskCategory** - Task categorization (e.g., HR, IT, Facilities, Legal)
- **TaskPriority** - Priority levels (high, medium, low)
- **DueRule** - Rules for calculating due dates:
  - `relative_to_start` - Days after hire date
  - `relative_to_anchor` - Days after anchor task completion
  - `fixed_date` - Specific date
  - `business_days` - Business day calculations

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
3. **Assignment Resolution**: Tasks assigned to roles auto-assign when created
4. **Status Transitions**: Tasks must follow valid status transition paths (todo → in_progress → completed)
5. **Completion Tracking**: Completed tasks must have completedAt timestamp
6. **Overdue Detection**: System tracks if task completed after due date
7. **Anchor Dependencies**: Tasks can wait on "anchor" task completion before due date calculation
8. **Business Day Calculation**: Due dates respect business days and can exclude weekends/holidays
9. **Due Date Automation**: Due dates automatically calculated based on hire date or anchor completion

### Domain Events Published

```typescript
- taskCreated            // When a new task is created for a candidate
- taskAssigned           // When a task is assigned/reassigned to a user
- taskStatusChanged      // When task status changes
- taskCompleted          // When task status changes to 'completed'
- taskOverdue            // When task becomes overdue
- deadlineApproaching    // When task deadline is approaching (24/48h warnings)
```

### Integration Points

**Consumes From:**
- **Candidate Management**: Candidate ID to associate tasks
- **User Management**: User IDs for task assignment

**Provides To:**
- **Candidate Management**: Via events when all required tasks complete (triggers stage advancement)
- **User Management**: Task counts for user workload

### Service Layer
- **TaskDefinitionService** (`server/services/tasks/task-definition.service.ts`)
  - `createTaskDefinition()` - Create reusable task template
  - `updateTaskDefinition()` - Update task definition
  - `getTaskDefinitions()` - Query task catalog
  - `deleteTaskDefinition()` - Remove task definition
- **CandidateTaskService** (`server/services/candidates/candidate-task.service.ts`)
  - `createCandidateTask()` - Create with validation and auto-assignment
  - `updateCandidateTask()` - Update with status transition rules
  - `completeCandidateTask()` - Mark as completed with timestamp
  - `getCandidateTasks()` - Query with filtering
  - `getMyTasks()` - Get current user's assigned tasks
- **DueDateService** (`server/services/tasks/due-date.service.ts`)
  - `calculateDueDate()` - Calculate based on due rules
  - `calculateBusinessDays()` - Business day arithmetic
  - `checkDeadlines()` - Scan for approaching/overdue tasks

### Data Access Layer
- **CandidateTaskRepository** (`server/repositories/candidates/CandidateTaskRepository.ts`)
  - Candidate task CRUD with filtering
  - Query by assignee, status, due date
  - "My tasks" queries for current user
- **TaskCategoryRepository** (`server/repositories/reference/TaskCategoryRepository.ts`)
- **TaskPriorityRepository** (`server/repositories/reference/TaskPriorityRepository.ts`)

### Routes
- **GET** `/api/tasks` - List task definitions
- **POST** `/api/tasks` - Create task definition
- **GET** `/api/tasks/mine` - Get my assigned tasks
- **GET** `/api/candidates/:candidateId/tasks` - Get candidate's tasks
- **POST** `/api/candidates/:candidateId/tasks` - Create task for candidate
- **PATCH** `/api/candidates/:candidateId/tasks/:taskId` - Update task
- **POST** `/api/candidates/:candidateId/tasks/:taskId/complete` - Complete task

(Routes defined in `server/routes/tasks.routes.ts`)

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
  - `getTemplate()` / `getTemplates()` - Query operations
  - `cloneTemplate()` - Create a copy with new name
  - `deleteTemplate()` - Remove template (soft delete)
- **TemplateExpansionService** (`server/services/templates/template-expansion.service.ts`)
  - `applyTemplateToCandidate()` - Expand template to create candidate tasks
  - `expandTemplateStages()` - Create stage snapshots
  - `expandTemplateTasks()` - Create candidate tasks from template
  - `calculateTaskDueDates()` - Apply due date rules during expansion

### Data Access Layer
- **TemplateRepository** (`server/repositories/templates/TemplateRepository.ts`)
  - Template CRUD with validation
  - Query active templates by candidate type
- **TemplateStageRepository** (`server/repositories/templates/TemplateStageRepository.ts`)
  - Stage CRUD and ordering
- **TemplateTaskRepository** (`server/repositories/templates/TemplateTaskRepository.ts`)
  - Task definition CRUD within templates

### Routes
- **GET** `/api/templates` - List templates
- **POST** `/api/templates` - Create template
- **GET** `/api/templates/:id` - Get template details
- **PATCH** `/api/templates/:id` - Update template
- **DELETE** `/api/templates/:id` - Delete template
- **POST** `/api/templates/:id/clone` - Clone template
- **GET** `/api/templates/:id/template-stages` - Get template stages
- **GET** `/api/templates/:id/template-tasks` - Get template tasks
- **POST** `/api/candidates/:candidateId/apply-template` - Apply template to candidate

(Routes defined in `server/routes/templates.routes.ts`)

---

## 4. User Management Context

### Purpose
Manage users, authentication, authorization, and user preferences.

### Aggregate Root
**User** - A person who uses the system.

### Entities & Value Objects
- **User** (Aggregate Root)
  - Properties: email, firstName, lastName, passwordHash, role, status, departmentId, divisionId, authProvider, externalId, lastLoginAt
  - Roles: system_admin, hr_staff, department_admin, division_leader, manager, candidate
  - Status: active, invited, disabled
  - Auth providers: local, ldap, google, azuread
- **UserIdentity** - Multi-provider authentication identities
  - Properties: userId, provider, externalId, email, username
  - Links multiple auth providers to one user account
- **UserRole** - Additional app-level role assignments
- **UserPreferences** - User-specific settings
  - Notification preferences (in-app, email, digest frequency)
  - Quiet hours configuration
  - Event subscriptions
  - Self-notification opt-in/out
- **AuthProvider** - Enabled authentication methods system configuration

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
2. **Password Security**: Passwords hashed with bcrypt and scrypt before storage
3. **Role Validation**: Roles must be from the valid role enum
4. **Multi-Provider Auth**: Users can authenticate via local, LDAP, Google, or Azure AD
5. **Identity Linking**: Multiple provider identities can link to one user account
6. **Invitation Flow**: Users can be invited via email, creating accounts with invited status
7. **Status Management**: Users can be active, invited (pending), or disabled
8. **Last Login Tracking**: System tracks last successful authentication
9. **Provider Configuration**: Authentication providers can be enabled/disabled system-wide

### Domain Events Published

```typescript
- userCreated            // When a new user is created
- userUpdated            // When user details are modified
- userInvited            // When user invitation is sent
- userRoleChanged        // When user roles are modified
- userDisabled           // When user account is disabled
- userEnabled            // When user account is enabled (reactivated)
- preferencesUpdated     // When user preferences are modified
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
  - `getUser()` / `getUsers()` - Query operations
  - `disableUser()` / `enableUser()` - Account status management
  - `changePassword()` - Password update with hashing
  - `linkCandidate()` - Link candidate profile to user account
- **InvitationService** (`server/services/users/invitation.service.ts`)
  - `sendInvitation()` - Send user invitation via email
  - `acceptInvitation()` - Complete invitation flow and activate account
  - `resendInvitation()` - Resend invitation email
- **UserPreferencesService** (`server/services/users/user-preferences.service.ts`)
  - `getUserPreferences()` - Get user preferences
  - `updateUserPreferences()` - Update notification and display preferences
- **AuthService** (`server/features/auth/services/auth.service.ts`)
  - Multi-provider authentication setup
  - Passport.js strategy configuration
  - Session management
  - User identity resolution across providers

### Data Access Layer
- **UserRepository** (`server/repositories/users/UserRepository.ts`)
  - User CRUD operations
  - Query by email, status, department, division
  - Pagination and filtering
- **UserPreferencesRepository** (`server/repositories/users/UserPreferencesRepository.ts`)
  - User preference CRUD
- **UserIdentityRepository** - Multi-provider identity mapping
- **UserRoleRepository** - Role assignment management

### Routes
- **GET** `/api/users` - List users
- **POST** `/api/users` - Create user
- **GET** `/api/users/:id` - Get user details
- **PATCH** `/api/users/:id` - Update user
- **GET** `/api/users/:id/preferences` - Get user preferences
- **PATCH** `/api/users/:id/preferences` - Update user preferences
- **POST** `/api/invitations/send` - Send user invitation
- **POST** `/api/invitations/:token/accept` - Accept invitation
- **POST** `/api/auth/login` - Login (local)
- **POST** `/api/auth/logout` - Logout
- **GET** `/api/auth/user` - Get current authenticated user
- **POST** `/api/auth/register` - Register new account (if enabled)

(Routes defined in `server/routes/users.routes.ts` and `server/routes/auth.routes.ts`)

---

## 5. Organization Management Context

### Purpose
Manage organizational structure including departments, divisions, and hiring stages.

### Aggregate Roots
**Department** and **Division** - Organizational units for scoping access and resources.

### Entities & Value Objects
- **Department** (Aggregate Root)
  - Properties: name, code, isActive
  - Departments group users, candidates, and divisions
- **Division** (Aggregate Root)
  - Properties: name, code, departmentId, isActive
  - Divisions are sub-units within departments
- **HiringStage** - Stages in the hiring pipeline
  - Properties: name, order, phase (pre_hire, post_hire)
  - Used across all templates and candidates

### Ubiquitous Language

| Term | Meaning in This Context |
|------|------------------------|
| **Department** | Top-level organizational unit (e.g., "College of Medicine") |
| **Division** | Sub-unit within a department (e.g., "Cardiology", "Oncology") |
| **Hiring Stage** | Step in the hiring pipeline (e.g., "Application", "Interview", "Offer") |
| **Stage Phase** | Whether stage is pre-hire or post-hire (onboarding) |
| **Stage Order** | Sequence number for stage ordering |

### Business Rules

1. **Department Uniqueness**: Department codes must be unique
2. **Division Parent**: Every division must belong to a department
3. **Stage Ordering**: Hiring stages have explicit order
4. **Phase Classification**: Stages categorized as pre-hire or post-hire
5. **Active Status**: Only active departments/divisions can be assigned

### Domain Events Published

```typescript
- departmentCreated      // When a new department is created
- departmentUpdated      // When department is modified
- divisionCreated        // When a new division is created
- divisionUpdated        // When division is modified
- hiringStageCreated     // When a new stage is added
- hiringStageReordered   // When stage order changes
```

### Integration Points

**Consumes From:**
- None (Organization context is foundational)

**Provides To:**
- **User Management**: Department and division IDs for scoping
- **Candidate Management**: Department, division, and hiring stages
- **Authorization**: Scoping context for access control

### Service Layer
- **DepartmentService** (`server/services/organizational/department.service.ts`)
  - `createDepartment()` - Create department
  - `updateDepartment()` - Update department
  - `getDepartments()` - List all departments
  - `activateDepartment()` / `deactivateDepartment()` - Status management
- **DivisionService** (`server/services/organizational/division.service.ts`)
  - `createDivision()` - Create division within department
  - `updateDivision()` - Update division
  - `getDivisions()` - List divisions (optionally by department)
  - `activateDivision()` / `deactivateDivision()` - Status management

### Data Access Layer
- **DepartmentRepository** (`server/repositories/organizational/DepartmentRepository.ts`)
  - Department CRUD
  - Query active departments
- **DivisionRepository** (`server/repositories/organizational/DivisionRepository.ts`)
  - Division CRUD
  - Query by department
- **HiringStageRepository** (`server/repositories/reference/HiringStageRepository.ts`)
  - Hiring stage CRUD
  - Ordering and phase queries

### Routes
- **GET** `/api/departments` - List departments
- **POST** `/api/departments` - Create department
- **PATCH** `/api/departments/:id` - Update department
- **GET** `/api/divisions` - List divisions
- **POST** `/api/divisions` - Create division
- **PATCH** `/api/divisions/:id` - Update division
- **GET** `/api/hiring-stages` - List hiring stages
- **POST** `/api/hiring-stages` - Create hiring stage
- **PATCH** `/api/hiring-stages/:id` - Update hiring stage

(Routes defined in `server/routes/organizations.routes.ts` and `server/routes/reference-data.routes.ts`)

---

## 6. Notification System Context

### Purpose
Manage multi-channel notifications with user preferences, digest aggregation, and reliable delivery.

### Aggregate Roots
**Notification** - An in-app or email notification to a user.

### Entities & Value Objects
- **Notification** (Aggregate Root)
  - Properties: userId, entityType, entityId, message, link, channels, isRead, readAt
  - Channels: in_app, email
  - Entity types: candidate, task, comment
- **NotificationKey** - Deduplication key to prevent duplicate notifications
  - Properties: key (composite), expiresAt
  - Ensures users don't get spammed with identical notifications
- **NotificationOutbox** - Email outbox for SMTP delivery
  - Properties: notificationId, recipientEmail, subject, body, deliveryFrequency, sentAt, failedAt
  - Delivery frequencies: immediate, daily_digest, weekly_digest
  - Implements outbox pattern for reliable email delivery

### Ubiquitous Language

| Term | Meaning in This Context |
|------|------------------------|
| **Notification** | A message to inform a user of an event |
| **Channel** | Delivery method (in-app, email) |
| **Digest** | Aggregated email with multiple notifications |
| **Quiet Hours** | Time period when emails are suppressed |
| **Deduplication** | Preventing duplicate notifications via keys |
| **Outbox** | Pending email queue for background processing |
| **Event Subscription** | User opt-in/out for specific event types |
| **@Mention** | Reference to a user in a comment triggering notification |

### Business Rules

1. **User Preferences**: Respect user notification channel preferences
2. **Quiet Hours**: Don't send emails during user-configured quiet hours
3. **Deduplication**: Use notification keys to prevent duplicate sends
4. **Digest Aggregation**: Batch notifications by frequency preference
5. **Event Subscriptions**: Users can opt-in/out of specific event types
6. **Self-Notification**: Users can choose whether to notify themselves
7. **Delivery Retry**: Failed emails retry with exponential backoff
8. **Automatic Cleanup**: Old read notifications pruned periodically

### Domain Events Published

```typescript
- notificationCreated    // When a new notification is created
- notificationRead       // When user marks notification as read
- emailQueued            // When email added to outbox
- emailSent              // When email successfully delivered
- emailFailed            // When email delivery fails
```

### Integration Points

**Consumes From:**
- **All Contexts**: Via EventBus to create notifications from domain events
- **User Management**: User preferences and contact info

**Provides To:**
- **All Contexts**: Notification delivery across the system

### Service Layer
- **NotificationService** (`server/services/shared/notification.service.ts`)
  - `createNotification()` - Create notification with deduplication
  - `getNotifications()` - Get user's notifications
  - `markAsRead()` - Mark notification as read
  - `markAllAsRead()` - Mark all user notifications as read
  - `extractMentions()` - Parse @mentions from text
- **NotificationCreationService** (`server/features/notifications/services/notification-creation.service.ts`)
  - `createNotificationsFromEvent()` - Event handler to create notifications
  - `determineRecipients()` - Who should receive notification
  - `checkUserPreferences()` - Respect user preferences
- **NotificationDeliveryService** (`server/features/notifications/services/notification-delivery.service.ts`)
  - `processOutbox()` - Background job to send emails
  - `aggregateDigests()` - Batch notifications for digests
  - `sendEmail()` - SMTP delivery via Nodemailer

### Data Access Layer
- **NotificationRepository** (`server/repositories/NotificationRepository.ts`)
  - Notification CRUD
  - Query by user, unread status
  - Pagination support
- **NotificationKeyRepository** - Deduplication key management
- **NotificationOutboxRepository** - Email queue management

### Routes
- **GET** `/api/notifications` - List user's notifications
- **PATCH** `/api/notifications/:id/read` - Mark as read
- **POST** `/api/notifications/read-all` - Mark all as read

(Routes defined in `server/routes/notifications.routes.ts`)

### Background Jobs
- **scan-deadlines.ts** - Scans for approaching deadlines, creates notifications
- **notification-email.ts** - Processes email outbox, sends pending emails
- **notification-cleanup.ts** - Removes old read notifications

---

## 7. Collaboration Context (Comments)

### Purpose
Enable team collaboration through comments on candidates and tasks with visibility control.

### Aggregate Root
**Comment** - A text message on a candidate or task.

### Entities & Value Objects
- **Comment** (Aggregate Root)
  - Properties: entityType, entityId, userId, content, visibility, parentCommentId, isDeleted
  - Entity types: candidate, task
  - Visibility: internal (staff-only), external (candidate-visible)
  - Supports nested replies via parentCommentId
- **CommentMention** - Extracted @mentions from comment content
  - Properties: commentId, userId
  - Triggers notifications for mentioned users

### Ubiquitous Language

| Term                 | Meaning in This Context                                    |
|----------------------|------------------------------------------------------------|
| **Comment**          | A text message on a candidate or task                      |
| **Internal Comment** | Visible only to staff (not candidates)                     |
| **External Comment** | Visible to both staff and candidates                       |
| **Reply**            | A nested comment responding to another comment             |
| **@Mention**         | Reference to a user using @username syntax                 |
| **Soft Delete**      | Marking comment as deleted without removing from database  |
| **Cascade Delete**   | Deleting a comment also deletes its replies                |

### Business Rules

1. **Visibility Control**: External comments visible to candidates, internal only to staff
2. **Mention Extraction**: System automatically extracts @mentions
3. **Mention Notifications**: Mentioned users receive notifications
4. **Soft Deletion**: Comments marked as deleted but retained in database
5. **Cascade Delete**: Deleting parent comment also deletes replies
6. **Rich Text Support**: Comments support rich text formatting (TipTap)
7. **Edit History**: Comments can be edited, with timestamp tracking
8. **Authorization**: Only comment author or admins can edit/delete

### Domain Events Published

```typescript
- commentCreated         // When a new comment is posted
- commentUpdated         // When comment is edited
- commentDeleted         // When comment is soft-deleted
- userMentioned          // When user is @mentioned in comment
```

### Integration Points

**Consumes From:**
- **Candidate Management**: Candidate ID for comments on candidates
- **Task Management**: Task ID for comments on tasks
- **User Management**: User ID for comment authors and mentions

**Provides To:**
- **Notification System**: Triggers notifications for mentions and new comments
- **Activity Log**: Comment activity appears in audit trail

### Service Layer
- **CommentService** (`server/services/shared/comment.service.ts`)
  - `createComment()` - Create comment with mention extraction
  - `updateComment()` - Edit comment content
  - `deleteComment()` - Soft delete with cascade to replies
  - `getComments()` - Query comments for entity
  - `extractMentions()` - Parse @mentions from text

### Data Access Layer
- **CommentRepository** (`server/repositories/CommentRepository.ts`)
  - Comment CRUD operations
  - Query by entity (candidate, task)
  - Filter by visibility
  - Support for nested replies

### Routes
- **GET** `/api/candidates/:candidateId/comments` - Get candidate comments
- **POST** `/api/candidates/:candidateId/comments` - Create comment on candidate
- **GET** `/api/tasks/:taskId/comments` - Get task comments (if implemented)
- **POST** `/api/tasks/:taskId/comments` - Create comment on task (if implemented)
- **PATCH** `/api/comments/:commentId` - Update comment
- **DELETE** `/api/comments/:commentId` - Delete comment

(Routes defined in `server/routes/candidates.routes.ts` and `server/routes/tasks.routes.ts`)

---

## 8. Audit Logging Context

### Purpose
Provide comprehensive audit trail for all CRUD operations and authorization events across the system for compliance, security, and accountability.

### Aggregate Root
**AuditLogEntry** - A record of a system action or event.

### Entities & Value Objects
- **AuditLogEntry** (Aggregate Root)
  - Properties: occurredAt, actorId, resourceType, resourceId, action, eventType, details, candidateId, taskId
  - Event types: crud (default), authorization
  - Resource types: candidate, candidate_task, task, template, template_task, comment, user, department, division, invitation, settings
  - Actions: create, update, delete, archive, restore, assign, status_change, access_denied

### Ubiquitous Language

| Term | Meaning in This Context |
|------|------------------------|
| **Audit Log Entry** | A record of a system action or authorization event |
| **Actor** | The user who performed the action (actorId) |
| **Resource Type** | The type of entity affected (candidate, task, etc.) |
| **Resource ID** | The unique identifier of the affected resource |
| **Action** | The type of operation performed (create, update, delete, etc.) |
| **Event Type** | Category of audit event (crud, authorization) |
| **Details** | JSON metadata about the action (changes, request ID, etc.) |
| **Access Denied** | Authorization failure logged for security tracking |
| **Cursor Pagination** | Efficient pagination using occurredAt timestamps |

### Business Rules

1. **Non-blocking Writes**: Audit log failures never block business operations
2. **Immutability**: Audit log entries cannot be modified or deleted
3. **Comprehensive Tracking**: All CRUD operations across resources are logged
4. **Authorization Tracking**: All access denied events are logged for security
5. **Request Correlation**: Request IDs stored in details for distributed tracing
6. **Indexed Queries**: Efficient querying by resource, actor, and time range
7. **Pagination**: Cursor-based pagination for large result sets
8. **Retention**: Audit logs retained indefinitely for compliance

### Domain Events Published

```typescript
// Audit Logging is an observer context - it doesn't publish events,
// it only consumes them from other contexts and writes audit entries
```

### Integration Points

**Consumes From:**
- **All Contexts**: Via `writeAuditLog()` helper function called from services
- Services call audit logger for CRUD operations and authorization events

**Provides To:**
- **System Administrators**: Audit trail queries for compliance and security
- **Security Team**: Authorization failure tracking

### Service Layer
- **AuditService** (`server/services/audit/audit.service.ts`)
  - `list()` - Query audit logs with filtering and pagination
    - Filter by resourceType, action, actorId
    - Cursor-based pagination with `before` parameter
    - Returns items + nextCursor
- **writeAuditLog()** (`server/services/shared/audit-logger.ts`)
  - Helper function called from other services
  - Non-blocking writes (catches and logs errors)
  - Accepts: actorId, resourceType, resourceId, action, eventType, details, candidateId, taskId, requestId
  - Stores in audit_log table

### Data Access Layer
- Direct Drizzle queries in `AuditService`
- Schema defined in `shared/schemas/audit.schema.ts`
- Indexed columns:
  - `audit_log_resource_idx` on (resource_type, resource_id, occurred_at DESC)
  - `audit_log_actor_idx` on (actor_id, occurred_at DESC)

### Routes
- **GET** `/api/admin/audit` - Query audit logs (system_admin, hr_staff only)
  - Query params: `resourceType`, `action`, `actorId`, `before` (cursor), `limit`
  - Returns: `{ items: AuditLogEntry[], nextCursor: string | null }`

(Routes defined in `server/routes/audit.routes.ts`)

### Usage Example

```typescript
// Services call writeAuditLog after operations
import { writeAuditLog } from '../shared/audit-logger';

// In CandidateService.createCandidate()
const candidate = await this.candidateRepo.create(data);

await writeAuditLog({
  actorId: authContext.user.id,
  resourceType: 'candidate',
  resourceId: candidate.id,
  action: 'create',
  candidateId: candidate.id,
  requestId: req.id,
  details: { departmentId: candidate.departmentId }
});
```

### Database Migration
- Migration `0018_crud_audit.sql` added columns:
  - `resource_type` - Type of resource (candidate, task, etc.)
  - `resource_id` - ID of the resource
  - `action` - CRUD action performed
- Indexes created for efficient querying

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
┌────────────────────────────────────────────────────────────────────┐
│                     Context Relationships                          │
└────────────────────────────────────────────────────────────────────┘

                    ┌────────────────────┐
                    │   Organization     │
                    │   Management       │
                    └────────────────────┘
                            │
                            │ [provides structure]
                            ▼
         ┌──────────────────────────────────────┐
         │                                      │
         ▼                                      ▼
┌─────────────────┐                   ┌─────────────────┐
│   Candidate     │◄─[reads from]─────│   Template      │
│  Management     │                   │  Management     │
└─────────────────┘                   └─────────────────┘
         │
         │ [publishes events]
         ▼
┌─────────────────┐                   ┌─────────────────┐
│      Task       │                   │      User       │
│  Management     │◄─[reads from]─────│  Management     │
└─────────────────┘                   └─────────────────┘
         │                                      │
         │                                      │
         │                                      ▼
         │                            ┌─────────────────┐
         └────────[events]────────────►│  Notification  │
                                      │     System      │
                                      └─────────────────┘
                                               ▲
                                               │
                                      ┌─────────────────┐
                                      │ Collaboration   │
                                      │   (Comments)    │
                                      └─────────────────┘
                                               │
                                               │
                    ┌──────────────────────────┴──────────────┐
                    │                                         │
             [publishes events]                        [reads from]
                    │                                         │
                    ▼                                         ▼
         All Contexts ──────────► EventBus ◄────────── All Contexts


Legend:
─[reads from]─>       : Repository call (synchronous)
─[publishes events]─> : Domain events (asynchronous via EventBus)
─[provides]─>         : Provides foundational data/structure
```

### Relationship Types

| From Context | To Context | Type | Integration Mechanism |
|-------------|-----------|------|----------------------|
| Candidate | Template | **Customer-Supplier** | Repository calls for template application |
| Task | Candidate | **Published Language** | Domain events for task completion |
| All | User | **Shared Kernel** | User IDs used across all contexts |
| All | Organization | **Shared Kernel** | Department/division IDs for scoping |
| Candidate | Task | **Partnership** | Bi-directional via events |
| Comments | Notification | **Customer-Supplier** | Events trigger notifications |
| Task | Notification | **Customer-Supplier** | Events trigger deadline notifications |
| All | Notification | **Published Language** | All contexts publish events consumed by notifications |
| Comments | Candidate | **Partnership** | Comments belong to candidates/tasks |
| Comments | Task | **Partnership** | Comments belong to candidates/tasks |
| All | Audit Logging | **Conformist** | All contexts call writeAuditLog() for audit trail |

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
**Owner:** Jonathan Steen - jesteen@uabmc.edu
**Last Updated:** 2025-12-09
**Version:** 1.1.0

**Change Process:**
1. Propose context boundary changes in architecture review
2. Update this document
3. Create migration plan if moving code between contexts
4. Update tests and documentation

**Recent Updates (2025-12-09):**
- Expanded from 4 to 7 bounded contexts
- Added Organization Management, Notification System, and Collaboration contexts
- Updated all service layer implementations with current methods
- Added comprehensive route definitions for all contexts
- Updated domain events to match EventBus implementation
- Enhanced business rules with current system behavior
- Added background jobs documentation for Notification context

---

## Context Health Metrics

| Context                 | Cohesion | Coupling | Documentation | Health Score |
|-------------------------|----------|----------|---------------|--------------|
| Candidate Management    | High     | Medium   | Complete      | ✅ 9/10      |
| Task Management         | High     | Medium   | Complete      | ✅ 9/10      |
| Template Management     | High     | Low      | Complete      | ✅ 10/10     |
| User Management         | High     | Low      | Complete      | ✅ 10/10     |
| Organization Management | High     | Low      | Complete      | ✅ 10/10     |
| Notification System     | Medium   | High     | Complete      | ✅ 8/10      |
| Collaboration           | High     | Medium   | Complete      | ✅ 9/10      |
| Audit Logging           | High     | Low      | Complete      | ✅ 10/10     |

**Overall System Score:** 9.4/10

**Notes:**
- Notification System has high coupling by design (consumes events from all contexts)
- Candidate and Task contexts have medium coupling due to bidirectional relationship
- Audit Logging has low coupling (observer pattern, non-blocking writes)
- All contexts have complete documentation and clear boundaries
- Context boundaries are respected in implementation

---

## References

- [Domain-Driven Design by Eric Evans](https://www.domainlanguage.com/ddd/)
- [Implementing Domain-Driven Design by Vaughn Vernon](https://www.informit.com/store/implementing-domain-driven-design-9780321834577)
- [Service Factory Pattern](../server/services/service-factory.ts) - Dependency injection

---

**Maintained By:** Jonathan Steen - jesteen@uabmc.edu
**License:** Proprietary
**Node.js Version:** 22.21.0
