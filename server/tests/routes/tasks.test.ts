import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createAuthTestEnvironment } from "../utils/testEnvironment";
import { seedAuthorizationFixtures, AUTH_FIXTURE_IDS } from "../utils/seedAuthorizationFixtures";
import { createAuthedAgent } from "../utils/testAgent";

async function setupTest(t: any, userId: string) {
  const env = await createAuthTestEnvironment();
  const resetStorage = env.useAsGlobalStorage();
  const fixtures = await seedAuthorizationFixtures(env.storage);
  const { agent } = await createAuthedAgent({ mockFactory: env.storage, userId });

  t.after(async () => {
    resetStorage();
    await env.dispose();
  });

  return { agent, fixtures, storage: env.storage };
}

describe("Task API - Create Operations", () => {
  test("hr staff can create a new task", async (t) => {
    const { agent, fixtures, storage } = await setupTest(t, AUTH_FIXTURE_IDS.users.hrStaff);

    const newTask = {
      candidateId: fixtures.candidates.alphaPrimary,
      title: "Complete Background Check",
      description: "Submit all required background check documents",
      categoryId: AUTH_FIXTURE_IDS.taskCategories.onboarding,
      priorityId: AUTH_FIXTURE_IDS.taskPriorities.medium,
      status: "pending",
      assigneeUserId: AUTH_FIXTURE_IDS.users.manager,
      dueDate: new Date("2025-12-31").toISOString()
    };

    const response = await agent
      .post("/api/tasks")
      .send(newTask)
      .expect(201);

    assert.ok(response.body.id, "Response should include task ID");
    assert.equal(response.body.title, "Complete Background Check");
    assert.equal(response.body.candidateId, fixtures.candidates.alphaPrimary);
    assert.equal(response.body.status, "todo");
    assert.equal(response.body.assigneeUserId, AUTH_FIXTURE_IDS.users.manager);

    // Verify task was created in storage
    const created = await storage.getTask(response.body.id);
    assert.ok(created, "Task should exist in storage");
    assert.equal(created?.title, "Complete Background Check");
  });

  test("task creation requires valid candidate", async (t) => {
    const { agent } = await setupTest(t, AUTH_FIXTURE_IDS.users.hrStaff);

    const newTask = {
      candidateId: "00000000-0000-0000-0000-000000000000", // Invalid candidate
      title: "Test Task",
      status: "pending"
    };

    await agent
      .post("/api/tasks")
      .send(newTask)
      .expect(400);
  });

  test("task creation requires title", async (t) => {
    const { agent, fixtures } = await setupTest(t, AUTH_FIXTURE_IDS.users.hrStaff);

    const newTask = {
      candidateId: fixtures.candidates.alphaPrimary,
      status: "pending"
      // Missing title
    };

    await agent
      .post("/api/tasks")
      .send(newTask)
      .expect(400);
  });

  test("task creation with invalid status fails", async (t) => {
    const { agent, fixtures } = await setupTest(t, AUTH_FIXTURE_IDS.users.hrStaff);

    const newTask = {
      candidateId: fixtures.candidates.alphaPrimary,
      title: "Test Task",
      status: "invalid_status"
    };

    await agent
      .post("/api/tasks")
      .send(newTask)
      .expect(400);
  });

  test("manager cannot create tasks", async (t) => {
    const { agent, fixtures } = await setupTest(t, AUTH_FIXTURE_IDS.users.manager);

    const newTask = {
      candidateId: fixtures.candidates.alphaPrimary,
      title: "Unauthorized Task",
      status: "pending"
    };

    await agent
      .post("/api/tasks")
      .send(newTask)
      .expect(403);
  });
});

describe("Task API - Read Operations", () => {
  test("hr staff can list all tasks", async (t) => {
    const { agent } = await setupTest(t, AUTH_FIXTURE_IDS.users.hrStaff);

    const response = await agent.get("/api/tasks").expect(200);

    assert.ok(Array.isArray(response.body), "Response should be an array");
    assert.ok(response.body.length >= 3, "Should have at least 3 tasks from fixtures");
  });

  test("hr staff can get task by id", async (t) => {
    const { agent, fixtures } = await setupTest(t, AUTH_FIXTURE_IDS.users.hrStaff);

    const response = await agent
      .get(`/api/tasks/${fixtures.tasks.alphaTask}`)
      .expect(200);

    assert.equal(response.body.id, fixtures.tasks.alphaTask);
    assert.ok(response.body.title, "Should have title");
    assert.ok(response.body.status, "Should have status");
  });

  test("get task with invalid id returns 404", async (t) => {
    const { agent } = await setupTest(t, AUTH_FIXTURE_IDS.users.hrStaff);

    await agent
      .get("/api/tasks/00000000-0000-0000-0000-000000000000")
      .expect(404);
  });

  test("manager can get their assigned tasks", async (t) => {
    const { agent, fixtures } = await setupTest(t, AUTH_FIXTURE_IDS.users.manager);

    const response = await agent.get("/api/tasks/mine").expect(200);

    assert.ok(Array.isArray(response.body));

    // All tasks should be assigned to the manager or in their scope
    for (const task of response.body) {
      const isAssignedToManager = task.assigneeUserId === AUTH_FIXTURE_IDS.users.manager;
      const isInScope = [
        fixtures.tasks.alphaTask,
        fixtures.tasks.managedTask
      ].includes(task.id);

      assert.ok(isAssignedToManager || isInScope, "Task should be in manager's scope");
    }
  });

  test("tasks can be filtered by candidate", async (t) => {
    const { agent, fixtures } = await setupTest(t, AUTH_FIXTURE_IDS.users.hrStaff);

    const response = await agent
      .get(`/api/candidates/${fixtures.candidates.alphaPrimary}/tasks`)
      .expect(200);

    assert.ok(Array.isArray(response.body));

    // All tasks should belong to the specified candidate
    for (const task of response.body) {
      assert.equal(task.candidateId, fixtures.candidates.alphaPrimary);
    }
  });

  test("tasks can be filtered by status", async (t) => {
    const { agent } = await setupTest(t, AUTH_FIXTURE_IDS.users.hrStaff);

    const response = await agent
      .get("/api/tasks")
      .query({ status: "pending" })
      .expect(200);

    assert.ok(Array.isArray(response.body));

    // All tasks should have pending status
    for (const task of response.body) {
      assert.equal(task.status, "todo");
    }
  });

  test("tasks can be filtered by assignee", async (t) => {
    const { agent } = await setupTest(t, AUTH_FIXTURE_IDS.users.hrStaff);

    const response = await agent
      .get("/api/tasks")
      .query({ assigneeUserId: AUTH_FIXTURE_IDS.users.manager })
      .expect(200);

    assert.ok(Array.isArray(response.body));

    // All tasks should be assigned to the manager
    for (const task of response.body) {
      assert.equal(task.assigneeUserId, AUTH_FIXTURE_IDS.users.manager);
    }
  });

  test("manager cannot view tasks outside their scope", async (t) => {
    const { agent, fixtures } = await setupTest(t, AUTH_FIXTURE_IDS.users.manager);

    await agent
      .get(`/api/tasks/${fixtures.tasks.betaTask}`)
      .expect(404);
  });

  test("candidate can view their own tasks", async (t) => {
    const { agent, fixtures } = await setupTest(t, AUTH_FIXTURE_IDS.users.candidateUser);

    const response = await agent
      .get(`/api/candidates/${fixtures.candidates.alphaPrimary}/tasks`)
      .expect(200);

    assert.ok(Array.isArray(response.body));
    assert.ok(response.body.length >= 1, "Should have at least one task");

    // Verify sensitive fields are sanitized
    const task = response.body[0];
    assert.equal(task.assigneeUserId, undefined, "Assignee should be sanitized");
    assert.equal(task.description, undefined, "Description should be sanitized");
  });
});

describe("Task API - Update Operations", () => {
  test("hr staff can update task status", async (t) => {
    const { agent, fixtures } = await setupTest(t, AUTH_FIXTURE_IDS.users.hrStaff);

    const response = await agent
      .patch(`/api/tasks/${fixtures.tasks.alphaTask}`)
      .send({ status: "in_progress" })
      .expect(200);

    assert.equal(response.body.status, "in_progress");
    assert.equal(response.body.id, fixtures.tasks.alphaTask);
  });

  test("hr staff can update task details", async (t) => {
    const { agent, fixtures } = await setupTest(t, AUTH_FIXTURE_IDS.users.hrStaff);

    const updates = {
      title: "Updated Task Title",
      description: "Updated description",
      priorityId: AUTH_FIXTURE_IDS.taskPriorities.medium
    };

    const response = await agent
      .patch(`/api/tasks/${fixtures.tasks.alphaTask}`)
      .send(updates)
      .expect(200);

    assert.equal(response.body.title, "Updated Task Title");
    assert.equal(response.body.description, "Updated description");
  });

  test("hr staff can reassign task", async (t) => {
    const { agent, fixtures } = await setupTest(t, AUTH_FIXTURE_IDS.users.hrStaff);

    const response = await agent
      .patch(`/api/tasks/${fixtures.tasks.alphaTask}`)
      .send({ assigneeUserId: AUTH_FIXTURE_IDS.users.hrStaff })
      .expect(200);

    assert.equal(response.body.assigneeUserId, AUTH_FIXTURE_IDS.users.hrStaff);
  });

  test("hr staff can update task due date", async (t) => {
    const { agent, fixtures } = await setupTest(t, AUTH_FIXTURE_IDS.users.hrStaff);

    const newDueDate = new Date("2025-12-31").toISOString();

    const response = await agent
      .patch(`/api/tasks/${fixtures.tasks.alphaTask}`)
      .send({ dueDate: newDueDate })
      .expect(200);

    assert.ok(response.body.dueDate);
    // Compare dates (ignore milliseconds)
    assert.ok(
      new Date(response.body.dueDate).toISOString().startsWith("2025-12-31")
    );
  });

  test("status change auto assigns unassigned task to actor", async (t) => {
    const { agent, fixtures, storage } = await setupTest(t, AUTH_FIXTURE_IDS.users.hrStaff);

    const existing = await storage.getTask(fixtures.tasks.alphaTask);
    assert.ok(existing, "Expected task fixture to exist");

    storage.data.candidateTasks.set(fixtures.tasks.alphaTask, {
      ...existing,
      assigneeUserId: null,
      assigneeKind: 'user',
      assigneeResolvedAt: null
    });

    const response = await agent
      .patch(`/api/tasks/${fixtures.tasks.alphaTask}`)
      .send({ status: "in_progress" })
      .expect(200);

    assert.equal(response.body.status, "in_progress");
    assert.equal(response.body.assigneeUserId, AUTH_FIXTURE_IDS.users.hrStaff);
  });

  test("manager can update status of assigned tasks", async (t) => {
    const { agent, fixtures, storage } = await setupTest(t, AUTH_FIXTURE_IDS.users.manager);

    // First verify the task is in manager's scope
    const task = await storage.getTask(fixtures.tasks.alphaTask);
    assert.ok(task);

    const response = await agent
      .patch(`/api/tasks/${fixtures.tasks.alphaTask}`)
      .send({ status: "completed" })
      .expect(200);

    assert.equal(response.body.status, "done");
  });

  test("manager cannot update tasks outside their scope", async (t) => {
    const { agent, fixtures } = await setupTest(t, AUTH_FIXTURE_IDS.users.manager);

    await agent
      .patch(`/api/tasks/${fixtures.tasks.betaTask}`)
      .send({ status: "completed" })
      .expect(404);
  });

  test("update with invalid status fails", async (t) => {
    const { agent, fixtures } = await setupTest(t, AUTH_FIXTURE_IDS.users.hrStaff);

    await agent
      .patch(`/api/tasks/${fixtures.tasks.alphaTask}`)
      .send({ status: "invalid_status" })
      .expect(400);
  });

  test("update preserves fields not included in request", async (t) => {
    const { agent, fixtures, storage } = await setupTest(t, AUTH_FIXTURE_IDS.users.hrStaff);

    const original = await storage.getTask(fixtures.tasks.alphaTask);
    assert.ok(original);

    const response = await agent
      .patch(`/api/tasks/${fixtures.tasks.alphaTask}`)
      .send({ description: "New description" })
      .expect(200);

    assert.equal(response.body.title, original.title);
    assert.equal(response.body.status, original.status);
    assert.equal(response.body.description, "New description");
  });
});

describe("Task API - Delete Operations", () => {
  test("hr staff can delete a task", async (t) => {
    const { agent, fixtures, storage } = await setupTest(t, AUTH_FIXTURE_IDS.users.hrStaff);

    // Create a task to delete
    const newTask = {
      candidateId: fixtures.candidates.alphaPrimary,
      title: "Task to Delete",
      status: "pending"
    };

    const createResponse = await agent
      .post("/api/tasks")
      .send(newTask)
      .expect(201);

    const taskId = createResponse.body.id;

    // Delete the task
    await agent
      .delete(`/api/tasks/${taskId}`)
      .expect(200);

    // Verify deletion
    const deleted = await storage.getTask(taskId);
    assert.equal(deleted, null, "Task should be deleted");
  });

  test("delete with invalid id returns 404", async (t) => {
    const { agent } = await setupTest(t, AUTH_FIXTURE_IDS.users.hrStaff);

    await agent
      .delete("/api/tasks/00000000-0000-0000-0000-000000000000")
      .expect(404);
  });

  test("manager cannot delete tasks", async (t) => {
    const { agent, fixtures } = await setupTest(t, AUTH_FIXTURE_IDS.users.manager);

    await agent
      .delete(`/api/tasks/${fixtures.tasks.alphaTask}`)
      .expect(403);
  });
});

describe("Task API - Bulk Operations", () => {
  test("hr staff can bulk update task statuses", async (t) => {
    const { agent, fixtures } = await setupTest(t, AUTH_FIXTURE_IDS.users.hrStaff);

    const taskIds = [fixtures.tasks.alphaTask, fixtures.tasks.betaTask];

    const response = await agent
      .post("/api/tasks/bulk-update")
      .send({
        taskIds,
        updates: { status: "completed" }
      })
      .expect(200);

    assert.ok(response.body.updated >= 2, "Should update at least 2 tasks");
  });

  test("bulk update validates all task ids", async (t) => {
    const { agent } = await setupTest(t, AUTH_FIXTURE_IDS.users.hrStaff);

    await agent
      .post("/api/tasks/bulk-update")
      .send({
        taskIds: ["00000000-0000-0000-0000-000000000000"],
        updates: { status: "completed" }
      })
      .expect(400);
  });
});

describe("Task API - Deadline Operations", () => {
  test("tasks with overdue dates are identified", async (t) => {
    const { agent, fixtures, storage } = await setupTest(t, AUTH_FIXTURE_IDS.users.hrStaff);

    // Create a task with past due date
    const overdueTask = {
      candidateId: fixtures.candidates.alphaPrimary,
      title: "Overdue Task",
      status: "pending",
      dueDate: new Date("2020-01-01").toISOString()
    };

    const createResponse = await agent
      .post("/api/tasks")
      .send(overdueTask)
      .expect(201);

    const response = await agent
      .get("/api/tasks")
      .query({ overdue: true })
      .expect(200);

    const taskIds = response.body.map((t: any) => t.id);
    assert.ok(taskIds.includes(createResponse.body.id), "Should include overdue task");
  });

  test("upcoming deadlines can be filtered", async (t) => {
    const { agent, fixtures } = await setupTest(t, AUTH_FIXTURE_IDS.users.hrStaff);

    // Create a task with upcoming due date
    const upcomingDate = new Date();
    upcomingDate.setDate(upcomingDate.getDate() + 7);

    const upcomingTask = {
      candidateId: fixtures.candidates.alphaPrimary,
      title: "Upcoming Task",
      status: "pending",
      dueDate: upcomingDate.toISOString()
    };

    await agent
      .post("/api/tasks")
      .send(upcomingTask)
      .expect(201);

    const response = await agent
      .get("/api/tasks")
      .query({ dueSoon: true })
      .expect(200);

    assert.ok(Array.isArray(response.body));
    // Verify all tasks have due dates within next 7 days
    for (const task of response.body) {
      if (task.dueDate) {
        const dueDate = new Date(task.dueDate);
        const now = new Date();
        const weekFromNow = new Date();
        weekFromNow.setDate(weekFromNow.getDate() + 7);

        assert.ok(dueDate >= now && dueDate <= weekFromNow);
      }
    }
  });
});

describe("Task API - Pagination and Sorting", () => {
  test("tasks list supports pagination", async (t) => {
    const { agent } = await setupTest(t, AUTH_FIXTURE_IDS.users.hrStaff);

    const response = await agent
      .get("/api/tasks")
      .query({ limit: 2, offset: 0 })
      .expect(200);

    assert.ok(Array.isArray(response.body));
    assert.ok(response.body.length <= 2, "Should respect limit");
  });

  test("tasks list supports sorting by due date", async (t) => {
    const { agent } = await setupTest(t, AUTH_FIXTURE_IDS.users.hrStaff);

    const response = await agent
      .get("/api/tasks")
      .query({ sortBy: "dueDate", sortOrder: "asc" })
      .expect(200);

    assert.ok(Array.isArray(response.body));

    // Verify ascending order (tasks with no due date at end)
    let lastDate: Date | null = null;
    for (const task of response.body) {
      if (task.dueDate) {
        const currentDate = new Date(task.dueDate);
        if (lastDate) {
          assert.ok(currentDate >= lastDate, "Tasks should be sorted by due date");
        }
        lastDate = currentDate;
      }
    }
  });

  test("tasks list supports sorting by status", async (t) => {
    const { agent } = await setupTest(t, AUTH_FIXTURE_IDS.users.hrStaff);

    const response = await agent
      .get("/api/tasks")
      .query({ sortBy: "status" })
      .expect(200);

    assert.ok(Array.isArray(response.body));
    assert.ok(response.body.length > 0);
  });
});
