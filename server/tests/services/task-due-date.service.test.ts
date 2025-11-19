import { test } from "node:test";
import assert from "node:assert/strict";
import { TaskDueDateService } from "../../services/tasks/task-due-date.service";
import type { Candidate, CandidateTask } from "@shared/schemas";
import { randomUUID } from "node:crypto";

/**
 * Test suite for TaskDueDateService
 *
 * Tests the business logic for recalculating task due dates based on
 * candidate anchor dates (LOO and start dates).
 */

// Mock database and repositories
function createMockDb() {
  const tasks: CandidateTask[] = [];

  return {
    select: () => ({
      from: () => ({
        where: (condition: any) => {
          // Return all tasks for testing
          return Promise.resolve(tasks);
        }
      })
    }),
    update: () => ({
      set: () => ({
        where: () => Promise.resolve()
      })
    }),
    transaction: async (callback: (tx: any) => Promise<void>) => {
      // Simple transaction mock
      await callback({
        update: () => ({
          set: () => ({
            where: () => Promise.resolve()
          })
        })
      });
    },
    _tasks: tasks // Expose for testing
  };
}

function createMockCandidateRepository(candidate: Candidate | null) {
  return {
    getCandidate: async (id: string) => candidate
  };
}

function createMockCandidateTaskRepository() {
  return {
    // Add methods as needed
  };
}

test("TaskDueDateService: recomputeCandidateDueDates throws error if candidate not found", async () => {
  const mockDb = createMockDb() as any;
  const mockCandidateRepo = createMockCandidateRepository(null) as any;
  const mockTaskRepo = createMockCandidateTaskRepository() as any;

  const service = new TaskDueDateService(mockDb, mockCandidateRepo, mockTaskRepo);

  await assert.rejects(
    async () => {
      await service.recomputeCandidateDueDates("nonexistent-id");
    },
    {
      message: "Candidate not found"
    }
  );
});

test("TaskDueDateService: recomputeCandidateDueDates returns 0 updates when no tasks exist", async () => {
  const candidate: Candidate = {
    id: "candidate-1",
    firstName: "John",
    lastName: "Doe",
    email: "john@example.com",
    phone: null,
    linkedUserId: null,
    departmentId: null,
    divisionId: null,
    facultyRankId: null,
    candidateTypeId: null,
    managerId: null,
    currentHiringStageId: null,
    status: "active",
    archived: false,
    looDate: null,
    anticipatedStartDate: null,
    actualStartDate: null,
    appliedTemplateId: null,
    appliedTemplateLockedAt: null,
    currentStageLockedUntil: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockDb = createMockDb() as any;
  const mockCandidateRepo = createMockCandidateRepository(candidate) as any;
  const mockTaskRepo = createMockCandidateTaskRepository() as any;

  const service = new TaskDueDateService(mockDb, mockCandidateRepo, mockTaskRepo);

  const result = await service.recomputeCandidateDueDates("candidate-1");

  assert.equal(result.updated, 0);
});

test("TaskDueDateService: recomputeCandidateDueDates calculates due dates based on LOO anchor", async () => {
  const looDate = new Date("2025-03-01");
  const candidate: Candidate = {
    id: "candidate-1",
    firstName: "John",
    lastName: "Doe",
    email: "john@example.com",
    phone: null,
    linkedUserId: null,
    departmentId: null,
    divisionId: null,
    facultyRankId: null,
    candidateTypeId: null,
    managerId: null,
    currentHiringStageId: null,
    status: "active",
    archived: false,
    looDate: looDate,
    anticipatedStartDate: null,
    actualStartDate: null,
    appliedTemplateId: null,
    appliedTemplateLockedAt: null,
    currentStageLockedUntil: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const taskId = randomUUID();
  const task: CandidateTask = {
    id: taskId,
    candidateId: "candidate-1",
    title: "Test Task",
    description: null,
    taskDefinitionId: null,
    categoryId: null,
    priorityId: null,
    status: "pending",
    assigneeUserId: null,
    creatorUserId: "user-1",
    dueRuleType: "days_before_loo", // Due 7 days before LOO
    dueRuleValue: 7,
    fixedDate: null,
    dueAt: new Date("2025-02-22"), // Correct date: 7 days before March 1
    pendingAnchor: false,
    completedAt: null,
    archived: false,
    fromTemplateTaskId: null,
    fromTemplateStageId: null,
    estimatedHours: null,
    isRequired: false,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockDb = createMockDb() as any;
  mockDb._tasks.push(task);

  const mockCandidateRepo = createMockCandidateRepository(candidate) as any;
  const mockTaskRepo = createMockCandidateTaskRepository() as any;

  const service = new TaskDueDateService(mockDb, mockCandidateRepo, mockTaskRepo);

  const result = await service.recomputeCandidateDueDates("candidate-1");

  // Since the due date is already correct, no updates should occur
  assert.equal(result.updated, 0);
});

test("TaskDueDateService: recomputeCandidateDueDates updates incorrect due dates", async () => {
  const looDate = new Date("2025-03-01");
  const candidate: Candidate = {
    id: "candidate-1",
    firstName: "John",
    lastName: "Doe",
    email: "john@example.com",
    phone: null,
    linkedUserId: null,
    departmentId: null,
    divisionId: null,
    facultyRankId: null,
    candidateTypeId: null,
    managerId: null,
    currentHiringStageId: null,
    status: "active",
    archived: false,
    looDate: looDate,
    anticipatedStartDate: null,
    actualStartDate: null,
    appliedTemplateId: null,
    appliedTemplateLockedAt: null,
    currentStageLockedUntil: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const taskId = randomUUID();
  const task: CandidateTask = {
    id: taskId,
    candidateId: "candidate-1",
    title: "Test Task",
    description: null,
    taskDefinitionId: null,
    categoryId: null,
    priorityId: null,
    status: "pending",
    assigneeUserId: null,
    creatorUserId: "user-1",
    dueRuleType: "days_before_loo",
    dueRuleValue: 7,
    fixedDate: null,
    dueAt: new Date("2025-01-01"), // WRONG date
    pendingAnchor: false,
    completedAt: null,
    archived: false,
    fromTemplateTaskId: null,
    fromTemplateStageId: null,
    estimatedHours: null,
    isRequired: false,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockDb = createMockDb() as any;
  mockDb._tasks.push(task);

  const mockCandidateRepo = createMockCandidateRepository(candidate) as any;
  const mockTaskRepo = createMockCandidateTaskRepository() as any;

  const service = new TaskDueDateService(mockDb, mockCandidateRepo, mockTaskRepo);

  const result = await service.recomputeCandidateDueDates("candidate-1");

  // Should update 1 task because due date is wrong
  assert.equal(result.updated, 1);
});

test("TaskDueDateService: recomputeCandidateDueDates sets pendingAnchor when anchor date missing", async () => {
  const candidate: Candidate = {
    id: "candidate-1",
    firstName: "John",
    lastName: "Doe",
    email: "john@example.com",
    phone: null,
    linkedUserId: null,
    departmentId: null,
    divisionId: null,
    facultyRankId: null,
    candidateTypeId: null,
    managerId: null,
    currentHiringStageId: null,
    status: "active",
    archived: false,
    looDate: null, // NO LOO DATE
    anticipatedStartDate: null,
    actualStartDate: null,
    appliedTemplateId: null,
    appliedTemplateLockedAt: null,
    currentStageLockedUntil: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const taskId = randomUUID();
  const task: CandidateTask = {
    id: taskId,
    candidateId: "candidate-1",
    title: "Test Task",
    description: null,
    taskDefinitionId: null,
    categoryId: null,
    priorityId: null,
    status: "pending",
    assigneeUserId: null,
    creatorUserId: "user-1",
    dueRuleType: "days_before_loo", // Requires LOO date but it's missing
    dueRuleValue: 7,
    fixedDate: null,
    dueAt: null,
    pendingAnchor: false, // Should become true
    completedAt: null,
    archived: false,
    fromTemplateTaskId: null,
    fromTemplateStageId: null,
    estimatedHours: null,
    isRequired: false,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockDb = createMockDb() as any;
  mockDb._tasks.push(task);

  const mockCandidateRepo = createMockCandidateRepository(candidate) as any;
  const mockTaskRepo = createMockCandidateTaskRepository() as any;

  const service = new TaskDueDateService(mockDb, mockCandidateRepo, mockTaskRepo);

  const result = await service.recomputeCandidateDueDates("candidate-1");

  // Should update because pendingAnchor needs to change to true
  assert.equal(result.updated, 1);
});

test("TaskDueDateService: recomputeCandidateDueDates skips archived tasks", async () => {
  const looDate = new Date("2025-03-01");
  const candidate: Candidate = {
    id: "candidate-1",
    firstName: "John",
    lastName: "Doe",
    email: "john@example.com",
    phone: null,
    linkedUserId: null,
    departmentId: null,
    divisionId: null,
    facultyRankId: null,
    candidateTypeId: null,
    managerId: null,
    currentHiringStageId: null,
    status: "active",
    archived: false,
    looDate: looDate,
    anticipatedStartDate: null,
    actualStartDate: null,
    appliedTemplateId: null,
    appliedTemplateLockedAt: null,
    currentStageLockedUntil: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const archivedTaskId = randomUUID();
  const archivedTask: CandidateTask = {
    id: archivedTaskId,
    candidateId: "candidate-1",
    title: "Archived Task",
    description: null,
    taskDefinitionId: null,
    categoryId: null,
    priorityId: null,
    status: "done",
    assigneeUserId: null,
    creatorUserId: "user-1",
    dueRuleType: "days_before_loo",
    dueRuleValue: 7,
    fixedDate: null,
    dueAt: new Date("2025-01-01"), // Wrong date but archived
    pendingAnchor: false,
    completedAt: new Date(),
    archived: true, // ARCHIVED
    fromTemplateTaskId: null,
    fromTemplateStageId: null,
    estimatedHours: null,
    isRequired: false,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockDb = createMockDb() as any;
  mockDb._tasks.push(archivedTask);

  const mockCandidateRepo = createMockCandidateRepository(candidate) as any;
  const mockTaskRepo = createMockCandidateTaskRepository() as any;

  const service = new TaskDueDateService(mockDb, mockCandidateRepo, mockTaskRepo);

  const result = await service.recomputeCandidateDueDates("candidate-1");

  // Should not update archived tasks
  assert.equal(result.updated, 0);
});

test("TaskDueDateService: recomputeCandidateDueDates handles fixed_date rule type", async () => {
  const fixedDate = new Date("2025-04-15");
  const candidate: Candidate = {
    id: "candidate-1",
    firstName: "John",
    lastName: "Doe",
    email: "john@example.com",
    phone: null,
    linkedUserId: null,
    departmentId: null,
    divisionId: null,
    facultyRankId: null,
    candidateTypeId: null,
    managerId: null,
    currentHiringStageId: null,
    status: "active",
    archived: false,
    looDate: null,
    anticipatedStartDate: null,
    actualStartDate: null,
    appliedTemplateId: null,
    appliedTemplateLockedAt: null,
    currentStageLockedUntil: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const taskId = randomUUID();
  const task: CandidateTask = {
    id: taskId,
    candidateId: "candidate-1",
    title: "Fixed Date Task",
    description: null,
    taskDefinitionId: null,
    categoryId: null,
    priorityId: null,
    status: "pending",
    assigneeUserId: null,
    creatorUserId: "user-1",
    dueRuleType: "fixed_date",
    dueRuleValue: null,
    fixedDate: fixedDate,
    dueAt: fixedDate, // Correct
    pendingAnchor: false,
    completedAt: null,
    archived: false,
    fromTemplateTaskId: null,
    fromTemplateStageId: null,
    estimatedHours: null,
    isRequired: false,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockDb = createMockDb() as any;
  mockDb._tasks.push(task);

  const mockCandidateRepo = createMockCandidateRepository(candidate) as any;
  const mockTaskRepo = createMockCandidateTaskRepository() as any;

  const service = new TaskDueDateService(mockDb, mockCandidateRepo, mockTaskRepo);

  const result = await service.recomputeCandidateDueDates("candidate-1");

  // Fixed date tasks don't depend on anchors, no update needed
  assert.equal(result.updated, 0);
});
