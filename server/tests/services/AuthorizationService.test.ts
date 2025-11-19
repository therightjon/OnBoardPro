import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { AuthorizationService } from "../../services/authorization/AuthorizationService";
import type { AuthorizationContext } from "../../repositories/base/types";
import type { Candidate, CandidateTask } from "@shared/schemas";

/**
 * Test suite for AuthorizationService
 *
 * Tests policy-based authorization for candidates, tasks, and other resources
 */

test("AuthorizationService: buildContext creates context from user session", () => {
  const service = new AuthorizationService();

  const user: any = {
    id: "user-1",
    role: "manager",
    roles: ["manager", "department_admin"],
    departmentScopes: ["dept-1", "dept-2"],
    divisionScopes: ["div-1"],
    managedCandidateIds: ["candidate-1", "candidate-2"]
  };

  const context = service.buildContext(user);

  assert.equal(context.userId, "user-1");
  assert.ok(context.roles.has("manager"));
  assert.ok(context.roles.has("department_admin"));
  assert.equal(context.departmentIds.size, 2);
  assert.ok(context.departmentIds.has("dept-1"));
  assert.equal(context.divisionIds.size, 1);
  assert.ok(context.divisionIds.has("div-1"));
  assert.equal(context.managedCandidateIds.size, 2);
  assert.equal(context.privileged, false);
  assert.equal(context.isCandidate, false);
});

test("AuthorizationService: buildContext handles null user", () => {
  const service = new AuthorizationService();

  const context = service.buildContext(null);

  assert.equal(context.userId, null);
  assert.equal(context.roles.size, 0);
  assert.equal(context.departmentIds.size, 0);
  assert.equal(context.privileged, false);
  assert.equal(context.isCandidate, false);
});

test("AuthorizationService: buildContext detects privileged roles", () => {
  const service = new AuthorizationService();

  const adminUser: any = {
    id: "admin-1",
    role: "system_admin"
  };

  const hrUser: any = {
    id: "hr-1",
    role: "hr_staff"
  };

  const adminContext = service.buildContext(adminUser);
  const hrContext = service.buildContext(hrUser);

  assert.equal(adminContext.privileged, true);
  assert.equal(hrContext.privileged, true);
});

test("AuthorizationService: buildContext detects candidate role", () => {
  const service = new AuthorizationService();

  const candidateUser: any = {
    id: "candidate-1",
    role: "candidate"
  };

  const context = service.buildContext(candidateUser);

  assert.equal(context.isCandidate, true);
  assert.equal(context.privileged, false);
});

test("AuthorizationService: privileged user can view any candidate", async () => {
  const service = new AuthorizationService();

  const context: AuthorizationContext = {
    userId: "admin-1",
    roles: new Set(["system_admin"]),
    departmentIds: new Set(),
    divisionIds: new Set(),
    managedCandidateIds: new Set(),
    privileged: true,
    isCandidate: false
  };

  const candidate: Candidate = {
    id: randomUUID(),
    firstName: "John",
    lastName: "Doe",
    email: "john@example.com",
    phone: null,
    linkedUserId: null,
    departmentId: "dept-1",
    divisionId: "div-1",
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

  const result = await service.authorize(context, "candidate", "view", candidate);

  assert.ok(result.allowed);
  assert.equal(result.context?.privileged, true);
});

test("AuthorizationService: department admin can view candidates in their department", async () => {
  const service = new AuthorizationService();

  const departmentId = "dept-1";
  const context: AuthorizationContext = {
    userId: "dept-admin-1",
    roles: new Set(["department_admin"]),
    departmentIds: new Set([departmentId]),
    divisionIds: new Set(),
    managedCandidateIds: new Set(),
    privileged: false,
    isCandidate: false
  };

  const candidate: Candidate = {
    id: randomUUID(),
    firstName: "Jane",
    lastName: "Smith",
    email: "jane@example.com",
    phone: null,
    linkedUserId: null,
    departmentId: departmentId,
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

  const result = await service.authorize(context, "candidate", "view", candidate);

  assert.ok(result.allowed);
  assert.equal(result.context?.scope, "department");
});

test("AuthorizationService: department admin cannot view candidates outside their department", async () => {
  const service = new AuthorizationService();

  const context: AuthorizationContext = {
    userId: "dept-admin-1",
    roles: new Set(["department_admin"]),
    departmentIds: new Set(["dept-1"]),
    divisionIds: new Set(),
    managedCandidateIds: new Set(),
    privileged: false,
    isCandidate: false
  };

  const candidate: Candidate = {
    id: randomUUID(),
    firstName: "Jane",
    lastName: "Smith",
    email: "jane@example.com",
    phone: null,
    linkedUserId: null,
    departmentId: "dept-2", // Different department
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

  const result = await service.authorize(context, "candidate", "view", candidate);

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "not_in_scope");
});

test("AuthorizationService: manager can view candidates they manage", async () => {
  const service = new AuthorizationService();

  const candidateId = randomUUID();
  const context: AuthorizationContext = {
    userId: "manager-1",
    roles: new Set(["manager"]),
    departmentIds: new Set(),
    divisionIds: new Set(),
    managedCandidateIds: new Set([candidateId]),
    privileged: false,
    isCandidate: false
  };

  const candidate: Candidate = {
    id: candidateId,
    firstName: "Bob",
    lastName: "Johnson",
    email: "bob@example.com",
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

  const result = await service.authorize(context, "candidate", "view", candidate);

  assert.ok(result.allowed);
  assert.equal(result.context?.scope, "managed");
});

test("AuthorizationService: candidate can view their own record", async () => {
  const service = new AuthorizationService();

  const userId = "user-1";
  const context: AuthorizationContext = {
    userId: userId,
    roles: new Set(["candidate"]),
    departmentIds: new Set(),
    divisionIds: new Set(),
    managedCandidateIds: new Set(),
    privileged: false,
    isCandidate: true
  };

  const candidate: Candidate = {
    id: randomUUID(),
    firstName: "Alice",
    lastName: "Brown",
    email: "alice@example.com",
    phone: null,
    linkedUserId: userId, // Linked to the same user
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

  const result = await service.authorize(context, "candidate", "view", candidate);

  assert.ok(result.allowed);
  assert.equal(result.context?.scope, "self");
  assert.equal(result.context?.sanitized, true);
});

test("AuthorizationService: unauthenticated user cannot view candidates", async () => {
  const service = new AuthorizationService();

  const context: AuthorizationContext = {
    userId: null,
    roles: new Set(),
    departmentIds: new Set(),
    divisionIds: new Set(),
    managedCandidateIds: new Set(),
    privileged: false,
    isCandidate: false
  };

  const candidate: Candidate = {
    id: randomUUID(),
    firstName: "Test",
    lastName: "User",
    email: "test@example.com",
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

  const result = await service.authorize(context, "candidate", "view", candidate);

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "not_authenticated");
});

test("AuthorizationService: task assignee can view their own task", async () => {
  const service = new AuthorizationService();

  const userId = "user-1";
  const candidateId = randomUUID();

  const context: AuthorizationContext = {
    userId: userId,
    roles: new Set(["manager"]),
    departmentIds: new Set(),
    divisionIds: new Set(),
    managedCandidateIds: new Set(),
    privileged: false,
    isCandidate: false
  };

  const candidate: Candidate = {
    id: candidateId,
    firstName: "Test",
    lastName: "Candidate",
    email: "candidate@example.com",
    phone: null,
    linkedUserId: null,
    departmentId: "dept-1",
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

  const task: CandidateTask & { candidate: Candidate } = {
    id: randomUUID(),
    candidateId: candidateId,
    title: "Review Application",
    description: null,
    taskDefinitionId: null,
    categoryId: null,
    priorityId: null,
    status: "pending",
    assigneeUserId: userId, // Assigned to the same user
    creatorUserId: "admin-1",
    dueRuleType: null,
    dueRuleValue: null,
    fixedDate: null,
    dueAt: null,
    pendingAnchor: false,
    completedAt: null,
    archived: false,
    fromTemplateTaskId: null,
    fromTemplateStageId: null,
    estimatedHours: null,
    isRequired: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    candidate: candidate
  };

  const result = await service.authorize(context, "candidate_task", "view", task);

  assert.ok(result.allowed);
  assert.equal(result.context?.scope, "assignee");
});

test("AuthorizationService: requireAuthorization throws if not authorized", async () => {
  const service = new AuthorizationService();

  const context: AuthorizationContext = {
    userId: null,
    roles: new Set(),
    departmentIds: new Set(),
    divisionIds: new Set(),
    managedCandidateIds: new Set(),
    privileged: false,
    isCandidate: false
  };

  const candidate: Candidate = {
    id: randomUUID(),
    firstName: "Test",
    lastName: "User",
    email: "test@example.com",
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

  await assert.rejects(
    async () => {
      await service.requireAuthorization(context, "candidate", "view", candidate);
    },
    {
      message: /Authorization failed/
    }
  );
});

test("AuthorizationService: requireRoles returns true for authorized user", () => {
  const service = new AuthorizationService();

  const context: AuthorizationContext = {
    userId: "admin-1",
    roles: new Set(["system_admin"]),
    departmentIds: new Set(),
    divisionIds: new Set(),
    managedCandidateIds: new Set(),
    privileged: true,
    isCandidate: false
  };

  const mockRes = {
    status: () => ({ json: () => {} })
  };

  const result = service.requireRoles(context, mockRes, ["system_admin", "hr_staff"]);

  assert.equal(result, true);
});

test("AuthorizationService: requireRoles returns false for unauthorized user", () => {
  const service = new AuthorizationService();

  const context: AuthorizationContext = {
    userId: "user-1",
    roles: new Set(["candidate"]),
    departmentIds: new Set(),
    divisionIds: new Set(),
    managedCandidateIds: new Set(),
    privileged: false,
    isCandidate: true
  };

  let statusCode = 0;
  const mockRes = {
    status: (code: number) => {
      statusCode = code;
      return { json: () => {} };
    }
  };

  const result = service.requireRoles(context, mockRes, ["system_admin", "hr_staff"]);

  assert.equal(result, false);
  assert.equal(statusCode, 403);
});
