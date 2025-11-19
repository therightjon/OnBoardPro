import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { InMemoryStorage } from "../utils/inMemoryStorage";
import { seedAuthorizationFixtures } from "../utils/seedAuthorizationFixtures";
import type { AuthorizationContext } from "../../db/storage";

const IDS = {
  users: {
    systemAdmin: "f1111111-1111-1111-1111-111111111111",
    hrStaff: "f2222222-2222-2222-2222-222222222222",
    departmentAdmin: "f3333333-3333-3333-3333-333333333333",
    divisionLeader: "f4444444-4444-4444-4444-444444444444",
    manager: "f5555555-5555-5555-5555-555555555555",
  },
  departments: {
    alpha: "11111111-1111-1111-1111-111111111111",
    beta: "22222222-2222-2222-2222-222222222222"
  },
  divisions: {
    alpha: "33333333-3333-3333-3333-333333333333",
    beta: "44444444-4444-4444-4444-444444444444"
  },
  candidates: {
    alphaPrimary: "f8888888-8888-8888-8888-888888888888",
    betaCandidate: "f9999999-9999-9999-9999-999999999999",
    managedOnly: "fababab0-0000-0000-0000-000000000000"
  },
  tasks: {
    alphaTask: "fcdcdcdc-dcdc-dcdc-dcdc-dcdcdcdcdcdc",
    betaTask: "fdeedeee-deee-deee-deee-deeedeeedeee",
    managedTask: "fff0f0f0-f0f0-f0f0-f0f0-f0f0f0f0f0f0"
  },
  candidateTypes: {
    faculty: "55555555-5555-5555-5555-555555555555"
  }
} as const;

async function setupStorage(t: any) {
  const storage = new InMemoryStorage();
  const fixtures = await seedAuthorizationFixtures(storage);

  t.after(() => {
    storage.reset();
  });

  return { storage, fixtures };
}

function createAuthContext(overrides?: Partial<AuthorizationContext>): AuthorizationContext {
  return {
    userId: IDS.users.hrStaff,
    roles: ["hr_staff"],
    departmentScopes: [],
    divisionScopes: [],
    managedCandidateIds: [],
    ...overrides
  };
}

describe("Storage - Candidate Operations", () => {
  test("can create a new candidate", async (t) => {
    const { storage } = await setupStorage(t);

    const candidateId = "new-candidate-id";
    const newCandidate = {
      id: candidateId,
      firstName: "Jane",
      lastName: "Smith",
      email: "jane.smith@example.com",
      departmentId: IDS.departments.alpha,
      divisionId: IDS.divisions.alpha,
      candidateTypeId: IDS.candidateTypes.faculty,
      currentStatus: "pending_documents" as const,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await storage.createCandidate(newCandidate);

    const retrieved = await storage.getCandidate(candidateId);
    assert.ok(retrieved, "Candidate should be created");
    assert.equal(retrieved?.firstName, "Jane");
    assert.equal(retrieved?.lastName, "Smith");
    assert.equal(retrieved?.email, "jane.smith@example.com");
  });

  test("can update a candidate", async (t) => {
    const { storage, fixtures } = await setupStorage(t);

    const updates = {
      firstName: "Updated",
      phoneNumber: "+1-555-1234"
    };

    await storage.updateCandidate(fixtures.candidates.alphaPrimary, updates);

    const updated = await storage.getCandidate(fixtures.candidates.alphaPrimary);
    assert.equal(updated?.firstName, "Updated");
    assert.equal(updated?.phoneNumber, "+1-555-1234");
  });

  test("can delete a candidate", async (t) => {
    const { storage, fixtures } = await setupStorage(t);

    await storage.deleteCandidate(fixtures.candidates.alphaPrimary);

    const deleted = await storage.getCandidate(fixtures.candidates.alphaPrimary);
    assert.equal(deleted, null, "Candidate should be deleted");
  });

  test("getCandidate returns null for non-existent id", async (t) => {
    const { storage } = await setupStorage(t);

    const result = await storage.getCandidate("00000000-0000-0000-0000-000000000000");
    assert.equal(result, null);
  });

  test("cannot create candidate with duplicate email", async (t) => {
    const { storage, fixtures } = await setupStorage(t);

    const existingCandidate = await storage.getCandidate(fixtures.candidates.alphaPrimary);
    assert.ok(existingCandidate);

    const duplicateCandidate = {
      id: "duplicate-id",
      firstName: "Duplicate",
      lastName: "User",
      email: existingCandidate.email, // Same email
      departmentId: IDS.departments.alpha,
      candidateTypeId: IDS.candidateTypes.faculty,
      currentStatus: "pending_documents" as const,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await assert.rejects(
      async () => await storage.createCandidate(duplicateCandidate),
      "Should reject duplicate email"
    );
  });
});

describe("Storage - Candidate Filtering and Authorization", () => {
  test("getCandidates without context returns all candidates", async (t) => {
    const { storage } = await setupStorage(t);

    const candidates = await storage.getCandidates({});

    assert.ok(candidates.length >= 3, "Should have at least 3 candidates from fixtures");
  });

  test("getCandidates with department scope filters correctly", async (t) => {
    const { storage, fixtures } = await setupStorage(t);

    const authContext = createAuthContext({
      userId: IDS.users.departmentAdmin,
      roles: ["department_admin"],
      departmentScopes: [IDS.departments.alpha]
    });

    const candidates = await storage.getCandidates({ authContext });

    // Should only return alpha department candidates
    assert.ok(candidates.length >= 1);
    for (const candidate of candidates) {
      assert.equal(candidate.departmentId, IDS.departments.alpha);
    }

    // Should not include beta candidate
    const ids = candidates.map(c => c.id);
    assert.ok(!ids.includes(fixtures.candidates.betaCandidate));
  });

  test("getCandidates with division scope filters correctly", async (t) => {
    const { storage } = await setupStorage(t);

    const authContext = createAuthContext({
      userId: IDS.users.divisionLeader,
      roles: ["division_leader"],
      divisionScopes: [IDS.divisions.alpha]
    });

    const candidates = await storage.getCandidates({ authContext });

    // Should only return alpha division candidates
    for (const candidate of candidates) {
      assert.equal(candidate.divisionId, IDS.divisions.alpha);
    }
  });

  test("getCandidates with manager scope includes managed candidates", async (t) => {
    const { storage, fixtures } = await setupStorage(t);

    const authContext = createAuthContext({
      userId: IDS.users.manager,
      roles: ["manager"],
      managedCandidateIds: [
        fixtures.candidates.alphaPrimary,
        fixtures.candidates.managedOnly
      ]
    });

    const candidates = await storage.getCandidates({ authContext });

    const ids = candidates.map(c => c.id);
    assert.ok(ids.includes(fixtures.candidates.alphaPrimary));
    assert.ok(ids.includes(fixtures.candidates.managedOnly));
    assert.ok(!ids.includes(fixtures.candidates.betaCandidate));
  });

  test("getCandidates filters by department", async (t) => {
    const { storage } = await setupStorage(t);

    const candidates = await storage.getCandidates({
      departmentId: IDS.departments.alpha
    });

    for (const candidate of candidates) {
      assert.equal(candidate.departmentId, IDS.departments.alpha);
    }
  });

  test("getCandidates filters by status", async (t) => {
    const { storage } = await setupStorage(t);

    const candidates = await storage.getCandidates({
      status: "pending_documents"
    });

    for (const candidate of candidates) {
      assert.equal(candidate.currentStatus, "pending_documents");
    }
  });

  test("getCandidates supports search by name", async (t) => {
    const { storage } = await setupStorage(t);

    const candidates = await storage.getCandidates({
      search: "Alpha"
    });

    assert.ok(candidates.length >= 1);
    const hasMatch = candidates.some(c =>
      c.firstName?.includes("Alpha") ||
      c.lastName?.includes("Alpha")
    );
    assert.ok(hasMatch);
  });

  test("getCandidates supports search by email", async (t) => {
    const { storage } = await setupStorage(t);

    const candidates = await storage.getCandidates({
      search: "alpha"
    });

    assert.ok(candidates.length >= 1);
    const hasMatch = candidates.some(c =>
      c.email?.toLowerCase().includes("alpha")
    );
    assert.ok(hasMatch);
  });

  test("getCandidates supports pagination", async (t) => {
    const { storage } = await setupStorage(t);

    const page1 = await storage.getCandidates({ limit: 2, offset: 0 });
    const page2 = await storage.getCandidates({ limit: 2, offset: 2 });

    assert.ok(page1.length <= 2);
    assert.ok(page2.length <= 2);

    // Pages should have different candidates
    const page1Ids = page1.map(c => c.id);
    const page2Ids = page2.map(c => c.id);

    for (const id of page2Ids) {
      assert.ok(!page1Ids.includes(id), "Pages should not overlap");
    }
  });

  test("getCandidates supports sorting by name", async (t) => {
    const { storage } = await setupStorage(t);

    const candidates = await storage.getCandidates({
      sortBy: "lastName",
      sortOrder: "asc"
    });

    for (let i = 1; i < candidates.length; i++) {
      const prev = candidates[i - 1].lastName || "";
      const curr = candidates[i].lastName || "";
      assert.ok(prev <= curr, `Should be sorted: ${prev} <= ${curr}`);
    }
  });
});

describe("Storage - Task Operations", () => {
  test("can create a new task", async (t) => {
    const { storage, fixtures } = await setupStorage(t);

    const taskId = "new-task-id";
    const newTask = {
      id: taskId,
      candidateId: fixtures.candidates.alphaPrimary,
      title: "New Task",
      description: "Task description",
      status: "pending" as const,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await storage.createTask(newTask);

    const retrieved = await storage.getTask(taskId);
    assert.ok(retrieved, "Task should be created");
    assert.equal(retrieved?.title, "New Task");
    assert.equal(retrieved?.status, "pending");
  });

  test("can update a task", async (t) => {
    const { storage, fixtures } = await setupStorage(t);

    const updates = {
      title: "Updated Title",
      status: "in_progress" as const
    };

    await storage.updateTask(fixtures.tasks.alphaTask, updates);

    const updated = await storage.getTask(fixtures.tasks.alphaTask);
    assert.equal(updated?.title, "Updated Title");
    assert.equal(updated?.status, "in_progress");
  });

  test("can delete a task", async (t) => {
    const { storage, fixtures } = await setupStorage(t);

    await storage.deleteTask(fixtures.tasks.alphaTask);

    const deleted = await storage.getTask(fixtures.tasks.alphaTask);
    assert.equal(deleted, null, "Task should be deleted");
  });

  test("getTasks filters by candidate", async (t) => {
    const { storage, fixtures } = await setupStorage(t);

    const tasks = await storage.getTasks({
      candidateId: fixtures.candidates.alphaPrimary
    });

    for (const task of tasks) {
      assert.equal(task.candidateId, fixtures.candidates.alphaPrimary);
    }
  });

  test("getTasks filters by status", async (t) => {
    const { storage, fixtures } = await setupStorage(t);

    // First create a task with specific status
    await storage.updateTask(fixtures.tasks.alphaTask, { status: "completed" });

    const tasks = await storage.getTasks({
      status: "completed"
    });

    assert.ok(tasks.length >= 1);
    for (const task of tasks) {
      assert.equal(task.status, "completed");
    }
  });

  test("getTasks filters by assignee", async (t) => {
    const { storage, fixtures } = await setupStorage(t);

    // Update a task to have specific assignee
    await storage.updateTask(fixtures.tasks.alphaTask, {
      assigneeUserId: IDS.users.manager
    });

    const tasks = await storage.getTasks({
      assigneeUserId: IDS.users.manager
    });

    assert.ok(tasks.length >= 1);
    for (const task of tasks) {
      assert.equal(task.assigneeUserId, IDS.users.manager);
    }
  });

  test("getTasks with authorization context filters correctly", async (t) => {
    const { storage, fixtures } = await setupStorage(t);

    const authContext = createAuthContext({
      userId: IDS.users.manager,
      roles: ["manager"],
      managedCandidateIds: [fixtures.candidates.alphaPrimary, fixtures.candidates.managedOnly]
    });

    const tasks = await storage.getTasks({ authContext });

    // Tasks should only be for candidates in scope
    const allowedCandidates = [
      fixtures.candidates.alphaPrimary,
      fixtures.candidates.managedOnly
    ];

    for (const task of tasks) {
      assert.ok(
        allowedCandidates.includes(task.candidateId),
        "Task should be for candidate in scope"
      );
    }
  });
});

describe("Storage - User Operations", () => {
  test("can get user by id", async (t) => {
    const { storage } = await setupStorage(t);

    const user = await storage.getUser(IDS.users.hrStaff);

    assert.ok(user, "User should exist");
    assert.equal(user?.id, IDS.users.hrStaff);
    assert.ok(user?.email);
    assert.ok(user?.firstName);
    assert.ok(user?.lastName);
  });

  test("can get user by email", async (t) => {
    const { storage } = await setupStorage(t);

    const hrUser = await storage.getUser(IDS.users.hrStaff);
    assert.ok(hrUser);

    const userByEmail = await storage.getUserByEmail(hrUser.email);

    assert.ok(userByEmail, "Should find user by email");
    assert.equal(userByEmail?.id, IDS.users.hrStaff);
    assert.equal(userByEmail?.email, hrUser.email);
  });

  test("getUserByEmail returns null for non-existent email", async (t) => {
    const { storage } = await setupStorage(t);

    const result = await storage.getUserByEmail("nonexistent@example.com");
    assert.equal(result, null);
  });

  test("can get user roles", async (t) => {
    const { storage } = await setupStorage(t);

    const roles = await storage.getUserRoles(IDS.users.hrStaff);

    assert.ok(Array.isArray(roles));
    // HR staff should have at least their primary role
  });

  test("can get user department scopes", async (t) => {
    const { storage } = await setupStorage(t);

    const scopes = await storage.getUserDepartmentScopeIds(IDS.users.departmentAdmin);

    assert.ok(Array.isArray(scopes));
    // Department admin should have department scopes
    assert.ok(scopes.length >= 1);
    assert.ok(scopes.includes(IDS.departments.alpha));
  });

  test("can get user division scopes", async (t) => {
    const { storage } = await setupStorage(t);

    const scopes = await storage.getUserDivisionScopeIds(IDS.users.divisionLeader);

    assert.ok(Array.isArray(scopes));
    // Division leader should have division scopes
    assert.ok(scopes.length >= 1);
  });

  test("can get manager candidate scopes", async (t) => {
    const { storage, fixtures } = await setupStorage(t);

    const scopes = await storage.getManagerCandidateScopeIds(IDS.users.manager);

    assert.ok(Array.isArray(scopes));
    // Manager should have candidate scopes
    assert.ok(scopes.length >= 1);
    assert.ok(scopes.includes(fixtures.candidates.alphaPrimary) ||
              scopes.includes(fixtures.candidates.managedOnly));
  });
});

describe("Storage - Department and Division Operations", () => {
  test("can get department by id", async (t) => {
    const { storage } = await setupStorage(t);

    const department = await storage.getDepartment(IDS.departments.alpha);

    assert.ok(department, "Department should exist");
    assert.equal(department?.id, IDS.departments.alpha);
    assert.ok(department?.name);
  });

  test("can list all departments", async (t) => {
    const { storage } = await setupStorage(t);

    const departments = await storage.getDepartments();

    assert.ok(Array.isArray(departments));
    assert.ok(departments.length >= 2, "Should have at least 2 departments from fixtures");

    const ids = departments.map(d => d.id);
    assert.ok(ids.includes(IDS.departments.alpha));
    assert.ok(ids.includes(IDS.departments.beta));
  });

  test("can get division by id", async (t) => {
    const { storage } = await setupStorage(t);

    const division = await storage.getDivision(IDS.divisions.alpha);

    assert.ok(division, "Division should exist");
    assert.equal(division?.id, IDS.divisions.alpha);
    assert.ok(division?.name);
    assert.equal(division?.departmentId, IDS.departments.alpha);
  });

  test("can list divisions by department", async (t) => {
    const { storage } = await setupStorage(t);

    const divisions = await storage.getDivisions({
      departmentId: IDS.departments.alpha
    });

    assert.ok(Array.isArray(divisions));

    for (const division of divisions) {
      assert.equal(division.departmentId, IDS.departments.alpha);
    }
  });
});

describe("Storage - Complex Queries", () => {
  test("can get candidates with related data", async (t) => {
    const { storage, fixtures } = await setupStorage(t);

    const candidate = await storage.getCandidate(fixtures.candidates.alphaPrimary);
    assert.ok(candidate);

    // Verify related IDs exist
    if (candidate.departmentId) {
      const department = await storage.getDepartment(candidate.departmentId);
      assert.ok(department, "Related department should exist");
    }

    if (candidate.divisionId) {
      const division = await storage.getDivision(candidate.divisionId);
      assert.ok(division, "Related division should exist");
    }
  });

  test("can get tasks for a candidate with details", async (t) => {
    const { storage, fixtures } = await setupStorage(t);

    const tasks = await storage.getTasks({
      candidateId: fixtures.candidates.alphaPrimary
    });

    assert.ok(tasks.length >= 1);

    for (const task of tasks) {
      assert.equal(task.candidateId, fixtures.candidates.alphaPrimary);

      // Verify task has required fields
      assert.ok(task.id);
      assert.ok(task.title);
      assert.ok(task.status);
    }
  });

  test("can count candidates with filters", async (t) => {
    const { storage } = await setupStorage(t);

    const totalCount = await storage.getCandidateCount({});
    assert.ok(totalCount >= 3, "Should have at least 3 candidates");

    const departmentCount = await storage.getCandidateCount({
      departmentId: IDS.departments.alpha
    });
    assert.ok(departmentCount >= 1);
    assert.ok(departmentCount <= totalCount);
  });

  test("can count tasks with filters", async (t) => {
    const { storage, fixtures } = await setupStorage(t);

    const totalCount = await storage.getTaskCount({});
    assert.ok(totalCount >= 3, "Should have at least 3 tasks");

    const candidateTaskCount = await storage.getTaskCount({
      candidateId: fixtures.candidates.alphaPrimary
    });
    assert.ok(candidateTaskCount >= 1);
    assert.ok(candidateTaskCount <= totalCount);
  });
});

describe("Storage - Data Integrity", () => {
  test("cascade delete: deleting candidate deletes related tasks", async (t) => {
    const { storage, fixtures } = await setupStorage(t);

    // Get tasks for candidate before deletion
    const tasksBefore = await storage.getTasks({
      candidateId: fixtures.candidates.alphaPrimary
    });
    assert.ok(tasksBefore.length >= 1, "Should have tasks before deletion");

    // Delete candidate
    await storage.deleteCandidate(fixtures.candidates.alphaPrimary);

    // Verify tasks are also deleted (or orphaned based on implementation)
    const tasksAfter = await storage.getTasks({
      candidateId: fixtures.candidates.alphaPrimary
    });
    assert.equal(tasksAfter.length, 0, "Tasks should be deleted with candidate");
  });

  test("referential integrity: cannot create task for non-existent candidate", async (t) => {
    const { storage } = await setupStorage(t);

    const invalidTask = {
      id: "invalid-task",
      candidateId: "00000000-0000-0000-0000-000000000000", // Non-existent
      title: "Invalid Task",
      status: "pending" as const,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await assert.rejects(
      async () => await storage.createTask(invalidTask),
      "Should reject task with invalid candidate"
    );
  });
});
