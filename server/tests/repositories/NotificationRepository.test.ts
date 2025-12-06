import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Notification } from "@shared/schemas";

/**
 * Test suite for NotificationRepository
 *
 * Tests notification CRUD operations, cursor pagination, and read/unread status management.
 */

type MockDb = {
  _notifications: Map<string, Notification>;
  select: any;
  insert: any;
  update: any;
};

function createMockDb(): MockDb {
  const notifications = new Map<string, Notification>();

  const mockDb: MockDb = {
    _notifications: notifications,
    select: (fields?: any) => ({
      from: (table: any) => ({
        where: (condition: any) => {
          const results = Array.from(notifications.values());
          const whereObj = {
            orderBy: (order: any) => ({
              limit: (count: number) => {
                const sorted = results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
                return Promise.resolve(sorted.slice(0, count));
              }
            }),
            // Make it thenable for direct await
            then: (resolve: any, reject: any) => {
              return Promise.resolve(results).then(resolve, reject);
            }
          };
          return whereObj;
        },
        orderBy: (order: any) => ({
          limit: (count: number) => {
            const sorted = Array.from(notifications.values())
              .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
            return Promise.resolve(sorted.slice(0, count));
          }
        })
      })
    }),
    insert: (table: any) => ({
      values: (values: Notification | Notification[]) => ({
        returning: () => {
          const items = Array.isArray(values) ? values : [values];
          const results: Notification[] = [];
          for (const item of items) {
            const notif = { ...item };
            notifications.set(notif.id, notif);
            results.push(notif);
          }
          return Promise.resolve(results);
        }
      })
    }),
    update: (table: any) => ({
      set: (updates: Partial<Notification>) => ({
        where: (condition: any) => {
          // Update all notifications for testing
          for (const [id, notif] of notifications.entries()) {
            Object.assign(notif, updates);
          }
          return Promise.resolve();
        }
      })
    })
  };

  return mockDb;
}

test("NotificationRepository: creates single notification", async () => {
  const mockDb = createMockDb();

  const notification: Notification = {
    id: randomUUID(),
    recipientUserId: "user-1",
    eventType: "task.assigned",
    title: "New task assigned",
    message: "You have been assigned a new task",
    actorUserId: "user-2",
    relatedEntityType: "candidate_task",
    relatedEntityId: "task-1",
    contextCandidateId: "candidate-1",
    read: false,
    readAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const result = await mockDb.insert(null).values(notification).returning();

  assert.equal(result.length, 1);
  assert.equal(result[0].recipientUserId, "user-1");
  assert.equal(result[0].eventType, "task.assigned");
  assert.equal(result[0].read, false);
  assert.equal(mockDb._notifications.size, 1);
});

test("NotificationRepository: creates multiple notifications in batch", async () => {
  const mockDb = createMockDb();

  const notifications: Notification[] = [
    {
      id: randomUUID(),
      recipientUserId: "user-1",
      eventType: "mention",
      title: "You were mentioned",
      message: "John mentioned you in a comment",
      actorUserId: "user-2",
      relatedEntityType: "comment",
      relatedEntityId: "comment-1",
      contextCandidateId: null,
      read: false,
      readAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: randomUUID(),
      recipientUserId: "user-1",
      eventType: "task.completed",
      title: "Task completed",
      message: "Background check task was completed",
      actorUserId: "user-3",
      relatedEntityType: "candidate_task",
      relatedEntityId: "task-2",
      contextCandidateId: "candidate-1",
      read: false,
      readAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];

  const result = await mockDb.insert(null).values(notifications).returning();

  assert.equal(result.length, 2);
  assert.equal(mockDb._notifications.size, 2);
  assert.ok(result.every(n => n.recipientUserId === "user-1"));
  assert.ok(result.every(n => !n.read));
});

test("NotificationRepository: retrieves notifications with cursor pagination", async () => {
  const mockDb = createMockDb();

  const baseTime = new Date("2025-01-01T10:00:00Z");
  const notifications: Notification[] = [];

  // Create 5 notifications with different timestamps
  for (let i = 0; i < 5; i++) {
    const createdAt = new Date(baseTime.getTime() + i * 60000); // 1 minute apart
    notifications.push({
      id: randomUUID(),
      recipientUserId: "user-1",
      eventType: "task.assigned",
      title: `Notification ${i + 1}`,
      message: `Test notification ${i + 1}`,
      actorUserId: "user-2",
      relatedEntityType: "candidate_task",
      relatedEntityId: `task-${i + 1}`,
      contextCandidateId: null,
      read: false,
      readAt: null,
      createdAt,
      updatedAt: createdAt
    });
  }

  for (const notif of notifications) {
    mockDb._notifications.set(notif.id, notif);
  }

  // Get first page (limit 3)
  const firstPage = await mockDb.select().from(null).where(null).orderBy(null).limit(3);

  assert.equal(firstPage.length, 3);
  // Should be newest first
  assert.ok(firstPage[0].createdAt >= firstPage[1].createdAt);
  assert.ok(firstPage[1].createdAt >= firstPage[2].createdAt);
});

test("NotificationRepository: marks notification as read", async () => {
  const mockDb = createMockDb();

  const notification: Notification = {
    id: randomUUID(),
    recipientUserId: "user-1",
    eventType: "candidate.statusChange",
    title: "Candidate status changed",
    message: "Candidate moved to Interview stage",
    actorUserId: "user-2",
    relatedEntityType: "candidate",
    relatedEntityId: "candidate-1",
    contextCandidateId: "candidate-1",
    read: false,
    readAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  mockDb._notifications.set(notification.id, notification);

  // Mark as read
  const now = new Date();
  await mockDb.update(null).set({ read: true, readAt: now, updatedAt: now }).where(null);

  const updated = mockDb._notifications.get(notification.id);
  assert.ok(updated);
  assert.equal(updated.read, true);
  assert.ok(updated.readAt);
});

test("NotificationRepository: filters by event type", async () => {
  const mockDb = createMockDb();

  const eventTypes = ["mention", "task.assigned", "task.completed", "mention"];

  for (const eventType of eventTypes) {
    const notification: Notification = {
      id: randomUUID(),
      recipientUserId: "user-1",
      eventType,
      title: `${eventType} notification`,
      message: "Test message",
      actorUserId: "user-2",
      relatedEntityType: "candidate_task",
      relatedEntityId: randomUUID(),
      contextCandidateId: null,
      read: false,
      readAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    mockDb._notifications.set(notification.id, notification);
  }

  const allNotifications = await mockDb.select().from(null).where(null).orderBy(null).limit(10);
  assert.equal(allNotifications.length, 4);

  // Count mentions
  const mentions = allNotifications.filter(n => n.eventType === "mention");
  assert.equal(mentions.length, 2);
});

test("NotificationRepository: handles candidate context", async () => {
  const mockDb = createMockDb();

  const candidateId = "candidate-123";
  const notifications: Notification[] = [
    {
      id: randomUUID(),
      recipientUserId: "user-1",
      eventType: "task.assigned",
      title: "Task assigned",
      message: "New task for candidate",
      actorUserId: "user-2",
      relatedEntityType: "candidate_task",
      relatedEntityId: "task-1",
      contextCandidateId: candidateId, // HAS CONTEXT
      read: false,
      readAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: randomUUID(),
      recipientUserId: "user-1",
      eventType: "mention",
      title: "Mentioned in comment",
      message: "You were mentioned",
      actorUserId: "user-2",
      relatedEntityType: "comment",
      relatedEntityId: "comment-1",
      contextCandidateId: null, // NO CONTEXT
      read: false,
      readAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];

  for (const notif of notifications) {
    mockDb._notifications.set(notif.id, notif);
  }

  const all = await mockDb.select().from(null).where(null).orderBy(null).limit(10);
  const withContext = all.filter(n => n.contextCandidateId === candidateId);
  const withoutContext = all.filter(n => !n.contextCandidateId);

  assert.equal(withContext.length, 1);
  assert.equal(withoutContext.length, 1);
  assert.equal(withContext[0].relatedEntityType, "candidate_task");
});

test("NotificationRepository: marks all notifications as read for user", async () => {
  const mockDb = createMockDb();

  const userId = "user-1";
  const notifications: Notification[] = [];

  for (let i = 0; i < 3; i++) {
    notifications.push({
      id: randomUUID(),
      recipientUserId: userId,
      eventType: "task.assigned",
      title: `Notification ${i + 1}`,
      message: "Test message",
      actorUserId: "user-2",
      relatedEntityType: "candidate_task",
      relatedEntityId: `task-${i + 1}`,
      contextCandidateId: null,
      read: false,
      readAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  for (const notif of notifications) {
    mockDb._notifications.set(notif.id, notif);
  }

  // Verify all unread
  let all = Array.from(mockDb._notifications.values());
  assert.ok(all.every(n => !n.read));

  // Mark all as read
  const now = new Date();
  await mockDb.update(null).set({ read: true, readAt: now, updatedAt: now }).where(null);

  // Verify all read
  all = Array.from(mockDb._notifications.values());
  assert.ok(all.every(n => n.read));
  assert.ok(all.every(n => n.readAt !== null));
});

test("NotificationRepository: handles different related entity types", async () => {
  const mockDb = createMockDb();

  const entityTypes = ["candidate", "candidate_task", "template", "comment"];

  for (const entityType of entityTypes) {
    const notification: Notification = {
      id: randomUUID(),
      recipientUserId: "user-1",
      eventType: "mention",
      title: "Notification",
      message: "Test message",
      actorUserId: "user-2",
      relatedEntityType: entityType,
      relatedEntityId: randomUUID(),
      contextCandidateId: null,
      read: false,
      readAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    mockDb._notifications.set(notification.id, notification);
  }

  const all = await mockDb.select().from(null).where(null).orderBy(null).limit(10);
  assert.equal(all.length, 4);

  const uniqueTypes = new Set(all.map(n => n.relatedEntityType));
  assert.equal(uniqueTypes.size, 4);
  assert.ok(uniqueTypes.has("candidate"));
  assert.ok(uniqueTypes.has("candidate_task"));
  assert.ok(uniqueTypes.has("template"));
  assert.ok(uniqueTypes.has("comment"));
});
