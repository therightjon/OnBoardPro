import { test } from "node:test";
import assert from "node:assert/strict";
import { EventBus } from "../../events/EventBus";
import { taskAssigned, candidateCreated } from "../../events/event-factory";
import type { TaskAssignedEvent, CandidateCreatedEvent } from "../../events/event-types";

/**
 * Test suite for EventBus
 *
 * Tests the core publish/subscribe functionality of the event bus
 */

test("EventBus: publishes event to specific subscribers", async () => {
  const bus = new EventBus({ async: false });
  const received: TaskAssignedEvent[] = [];

  bus.on<TaskAssignedEvent>("task.assigned", (event) => {
    received.push(event);
  });

  const event = taskAssigned("task-1", {
    candidateId: "candidate-1",
    taskTitle: "Test Task",
    assigneeUserId: "user-1",
    previousAssigneeId: null,
    dueAt: null
  });

  await bus.publish(event);

  assert.equal(received.length, 1);
  assert.equal(received[0].type, "task.assigned");
  assert.equal(received[0].payload.taskId, "task-1");
});

test("EventBus: publishes event to wildcard subscribers", async () => {
  const bus = new EventBus({ async: false });
  const received: any[] = [];

  bus.on("*", (event) => {
    received.push(event);
  });

  const event1 = taskAssigned("task-1", {
    candidateId: "candidate-1",
    taskTitle: "Task 1",
    assigneeUserId: "user-1",
    previousAssigneeId: null,
    dueAt: null
  });

  const event2 = candidateCreated("candidate-1", {
    firstName: "John",
    lastName: "Doe",
    email: "john@example.com",
    departmentId: null,
    divisionId: null,
    managerId: null
  });

  await bus.publish(event1);
  await bus.publish(event2);

  assert.equal(received.length, 2);
  assert.equal(received[0].type, "task.assigned");
  assert.equal(received[1].type, "candidate.created");
});

test("EventBus: multiple subscribers receive same event", async () => {
  const bus = new EventBus({ async: false });
  let count1 = 0;
  let count2 = 0;

  bus.on<TaskAssignedEvent>("task.assigned", () => {
    count1++;
  });

  bus.on<TaskAssignedEvent>("task.assigned", () => {
    count2++;
  });

  const event = taskAssigned("task-1", {
    candidateId: "candidate-1",
    taskTitle: "Test Task",
    assigneeUserId: "user-1",
    previousAssigneeId: null,
    dueAt: null
  });

  await bus.publish(event);

  assert.equal(count1, 1);
  assert.equal(count2, 1);
});

test("EventBus: respects handler priority", async () => {
  const bus = new EventBus({ async: false });
  const executionOrder: number[] = [];

  bus.on<TaskAssignedEvent>("task.assigned", () => {
    executionOrder.push(2);
  }, 0); // Low priority

  bus.on<TaskAssignedEvent>("task.assigned", () => {
    executionOrder.push(1);
  }, 10); // High priority

  bus.on<TaskAssignedEvent>("task.assigned", () => {
    executionOrder.push(3);
  }, -10); // Lower priority

  const event = taskAssigned("task-1", {
    candidateId: "candidate-1",
    taskTitle: "Test Task",
    assigneeUserId: "user-1",
    previousAssigneeId: null,
    dueAt: null
  });

  await bus.publish(event);

  assert.deepEqual(executionOrder, [1, 2, 3]);
});

test("EventBus: unsubscribe removes handler", async () => {
  const bus = new EventBus({ async: false });
  let count = 0;

  const unsubscribe = bus.on<TaskAssignedEvent>("task.assigned", () => {
    count++;
  });

  const event = taskAssigned("task-1", {
    candidateId: "candidate-1",
    taskTitle: "Test Task",
    assigneeUserId: "user-1",
    previousAssigneeId: null,
    dueAt: null
  });

  await bus.publish(event);
  assert.equal(count, 1);

  unsubscribe();

  await bus.publish(event);
  assert.equal(count, 1); // Should not increment
});

test("EventBus: once subscriber called only once", async () => {
  const bus = new EventBus({ async: false });
  let count = 0;

  bus.once<TaskAssignedEvent>("task.assigned", () => {
    count++;
  });

  const event = taskAssigned("task-1", {
    candidateId: "candidate-1",
    taskTitle: "Test Task",
    assigneeUserId: "user-1",
    previousAssigneeId: null,
    dueAt: null
  });

  await bus.publish(event);
  assert.equal(count, 1);

  await bus.publish(event);
  assert.equal(count, 1); // Should not increment
});

test("EventBus: handles async handlers", async () => {
  const bus = new EventBus({ async: false });
  const received: string[] = [];

  bus.on<TaskAssignedEvent>("task.assigned", async (event) => {
    // Simulate async work
    await new Promise(resolve => setImmediate(resolve));
    received.push(event.payload.taskId);
  });

  const event = taskAssigned("task-1", {
    candidateId: "candidate-1",
    taskTitle: "Test Task",
    assigneeUserId: "user-1",
    previousAssigneeId: null,
    dueAt: null
  });

  await bus.publish(event);

  assert.equal(received.length, 1);
  assert.equal(received[0], "task-1");
});

test("EventBus: middleware runs for all events", async () => {
  const bus = new EventBus({ async: false });
  const middlewareEvents: string[] = [];

  bus.use(async (event, next) => {
    middlewareEvents.push(event.type);
    await next();
  });

  const event1 = taskAssigned("task-1", {
    candidateId: "candidate-1",
    taskTitle: "Task 1",
    assigneeUserId: "user-1",
    previousAssigneeId: null,
    dueAt: null
  });

  const event2 = candidateCreated("candidate-1", {
    firstName: "John",
    lastName: "Doe",
    email: "john@example.com",
    departmentId: null,
    divisionId: null,
    managerId: null
  });

  await bus.publish(event1);
  await bus.publish(event2);

  assert.equal(middlewareEvents.length, 2);
  assert.equal(middlewareEvents[0], "task.assigned");
  assert.equal(middlewareEvents[1], "candidate.created");
});

test("EventBus: middleware can modify context", async () => {
  const bus = new EventBus({ async: false });
  let contextValue: string | undefined;

  bus.use(async (event, next) => {
    // Add metadata
    event.metadata = { ...event.metadata, processed: true };
    await next();
  });

  bus.on<TaskAssignedEvent>("task.assigned", (event) => {
    contextValue = event.metadata?.processed;
  });

  const event = taskAssigned("task-1", {
    candidateId: "candidate-1",
    taskTitle: "Test Task",
    assigneeUserId: "user-1",
    previousAssigneeId: null,
    dueAt: null
  });

  await bus.publish(event);

  assert.equal(contextValue, true);
});

test("EventBus: error in handler does not stop other handlers", async () => {
  const bus = new EventBus({ async: false, logErrors: false });
  let count1 = 0;
  let count2 = 0;

  bus.on<TaskAssignedEvent>("task.assigned", () => {
    count1++;
    throw new Error("Handler 1 error");
  });

  bus.on<TaskAssignedEvent>("task.assigned", () => {
    count2++;
  });

  const event = taskAssigned("task-1", {
    candidateId: "candidate-1",
    taskTitle: "Test Task",
    assigneeUserId: "user-1",
    previousAssigneeId: null,
    dueAt: null
  });

  await bus.publish(event);

  assert.equal(count1, 1);
  assert.equal(count2, 1); // Should still execute
});

test("EventBus: getSubscriberCount returns correct count", () => {
  const bus = new EventBus();

  assert.equal(bus.getSubscriberCount("task.assigned"), 0);

  bus.on<TaskAssignedEvent>("task.assigned", () => {});
  assert.equal(bus.getSubscriberCount("task.assigned"), 1);

  bus.on<TaskAssignedEvent>("task.assigned", () => {});
  assert.equal(bus.getSubscriberCount("task.assigned"), 2);
});

test("EventBus: clear removes all subscriptions", () => {
  const bus = new EventBus();

  bus.on<TaskAssignedEvent>("task.assigned", () => {});
  bus.on<CandidateCreatedEvent>("candidate.created", () => {});

  assert.ok(bus.getTotalSubscriptions() > 0);

  bus.clear();

  assert.equal(bus.getTotalSubscriptions(), 0);
});

test("EventBus: async mode does not block", async () => {
  const bus = new EventBus({ async: true });
  let completed = false;

  bus.on<TaskAssignedEvent>("task.assigned", async () => {
    await new Promise(resolve => setTimeout(resolve, 100));
    completed = true;
  });

  const event = taskAssigned("task-1", {
    candidateId: "candidate-1",
    taskTitle: "Test Task",
    assigneeUserId: "user-1",
    previousAssigneeId: null,
    dueAt: null
  });

  await bus.publish(event);

  // In async mode, publish returns immediately
  assert.equal(completed, false);

  // Wait for handler to complete
  await bus.waitForPending(200);

  assert.equal(completed, true);
});

test("EventBus: respects concurrency limit", async () => {
  const bus = new EventBus({ async: true, concurrency: 2 });
  let maxConcurrent = 0;
  let currentConcurrent = 0;

  const handler = async () => {
    currentConcurrent++;
    maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
    await new Promise(resolve => setTimeout(resolve, 50));
    currentConcurrent--;
  };

  // Register 5 handlers
  for (let i = 0; i < 5; i++) {
    bus.on<TaskAssignedEvent>("task.assigned", handler);
  }

  const event = taskAssigned("task-1", {
    candidateId: "candidate-1",
    taskTitle: "Test Task",
    assigneeUserId: "user-1",
    previousAssigneeId: null,
    dueAt: null
  });

  await bus.publish(event);
  await bus.waitForPending(500);

  // Should not exceed concurrency limit
  assert.ok(maxConcurrent <= 2);
});
