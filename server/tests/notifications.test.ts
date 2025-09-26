import { test } from "node:test";
import assert from "node:assert/strict";
import { filterRecipientsForNotification, computeNotificationCoalescing } from "../features/notifications/services/notify";
import { listNotificationsHandler, markNotificationReadHandler, markAllNotificationsReadHandler } from "../features/notifications/routes";
import type { RecipientWithPreferences } from "../features/notifications/services/notify";

function makeRecipient(overrides: Partial<RecipientWithPreferences & { allowSelf?: boolean }> = {}): RecipientWithPreferences {
  const basePreferences = {
    mytasksShowArchived: false,
    mytasksShowCanceled: false,
    mytasksShowCompleted: false,
    notifyInApp: true,
    notifyEmail: false,
    digestFrequency: "immediate",
    quietHoursStart: null,
    quietHoursEnd: null,
    allowSelfNotifications: false,
    eventSubscriptions: {
      "comment.created": true,
      "task.assigned": true,
      "stage.changed": true,
      mention: true,
    } as Record<string, boolean>,
  };

  return {
    userId: overrides.userId ?? "user-1",
    role: overrides.role ?? "system_admin",
    status: overrides.status ?? "active",
    active: overrides.active ?? true,
    preferences: {
      ...basePreferences,
      ...(overrides.preferences ?? {}),
    },
  };
}

test("filterRecipientsForNotification applies visibility, preference, and self rules", () => {
  const recipients: RecipientWithPreferences[] = [
    makeRecipient({ userId: "keep" }),
    makeRecipient({ userId: "no-in-app", preferences: { notifyInApp: false } }),
    makeRecipient({ userId: "no-sub", preferences: { eventSubscriptions: { "comment.created": false } } }),
    makeRecipient({ userId: "actor", preferences: { allowSelfNotifications: false } }),
    makeRecipient({ userId: "candidate-internal", role: "candidate" }),
  ];

  const { eligible, skipped } = filterRecipientsForNotification(recipients, {
    actorId: "actor",
    visibility: "internal",
    type: "comment.created",
  });

  assert.equal(eligible.length, 1);
  assert.equal(eligible[0].userId, "keep");

  const reasons = new Map(skipped.map((entry) => [entry.userId, entry.reason]));
  assert.equal(reasons.get("no-in-app"), "notify_in_app_disabled");
  assert.equal(reasons.get("no-sub"), "subscription_disabled");
  assert.equal(reasons.get("actor"), "self_notification_suppressed");
  assert.equal(reasons.get("candidate-internal"), "candidate_visibility");
});

test("candidate recipients allowed only for external visibility", () => {
  const candidateRecipient: RecipientWithPreferences = makeRecipient({ userId: "cand", role: "candidate" });

  // Internal visibility: should be skipped
  let result = filterRecipientsForNotification([candidateRecipient], {
    actorId: undefined,
    visibility: "internal",
    type: "task.assigned",
  });
  assert.equal(result.eligible.length, 0);
  assert.equal(result.skipped[0]?.reason, "candidate_visibility");

  // External visibility: should be eligible
  result = filterRecipientsForNotification([candidateRecipient], {
    actorId: undefined,
    visibility: "external",
    type: "task.assigned",
  });
  assert.equal(result.eligible.length, 1);
  assert.equal(result.eligible[0].userId, "cand");
});

test("computeNotificationCoalescing increments existing payload counts and prepares inserts", () => {
  const now = new Date("2024-01-01T00:00:00Z");
  const { updates, inserts } = computeNotificationCoalescing({
    recipientIds: ["user-a", "user-b"],
    existing: [
      {
        id: "n1",
        userId: "user-a",
        payload: { message: "hello" },
      },
    ],
    payload: { message: "hello" },
    entity: { type: "comment", id: "comment-1" },
    type: "comment.created",
    timestamp: now,
  });

  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0], {
    id: "n1",
    payload: { message: "hello", count: 2 },
  });

  assert.equal(inserts.length, 1);
  assert.equal(inserts[0].userId, "user-b");
  assert.equal(inserts[0].entityId, "comment-1");
  assert.equal(inserts[0].payload?.message, "hello");
});

test("listNotificationsHandler passes parsed params to storage and returns response", async () => {
  const calls: any[] = [];
  const storage = {
    async getNotifications(args: any) {
      calls.push(args);
      return { items: [], nextCursor: undefined, unreadCount: 3 };
    },
  };

  const req: any = {
    query: { limit: "5", cursor: "abc", unreadOnly: "1", type: "mention,comment.created" },
    user: { id: "user-1" },
  };
  let jsonPayload: any = undefined;
  const res: any = {
    json(payload: any) {
      jsonPayload = payload;
    }
  };

  await listNotificationsHandler(storage as any, req, res, () => {});

  assert.deepEqual(calls[0], {
    userId: "user-1",
    limit: 5,
    cursor: "abc",
    unreadOnly: true,
    types: ["mention", "comment.created"],
  });
  assert.deepEqual(jsonPayload, { items: [], nextCursor: undefined, unreadCount: 3 });
});

test("markNotificationReadHandler returns 400 when body invalid", async () => {
  let statusCode = 200;
  let response: any = undefined;
  const res: any = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(payload: any) {
      response = payload;
      return this;
    }
  };

  await markNotificationReadHandler({ setNotificationRead: async () => true } as any, { body: {}, params: { id: "1" }, user: { id: "u" } } as any, res, () => {});
  assert.equal(statusCode, 400);
  assert.equal(response.message.includes('isRead'), true);
});

test("markNotificationReadHandler handles missing notification", async () => {
  let statusCode = 200;
  let response: any = undefined;
  const storage = { setNotificationRead: async () => false };
  const res: any = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(payload: any) {
      response = payload;
      return this;
    }
  };

  await markNotificationReadHandler(storage as any, { body: { isRead: true }, params: { id: "missing" }, user: { id: "u" } } as any, res, () => {});
  assert.equal(statusCode, 404);
  assert.equal(response.message, "Notification not found");
});

test("markNotificationReadHandler returns success", async () => {
  let response: any = undefined;
  const storage = { setNotificationRead: async () => true };
  const res: any = {
    json(payload: any) {
      response = payload;
      return this;
    }
  };

  await markNotificationReadHandler(storage as any, { body: { isRead: true }, params: { id: "notif" }, user: { id: "user" } } as any, res, () => {});
  assert.deepEqual(response, { success: true });
});

test("markAllNotificationsReadHandler returns count", async () => {
  let response: any = undefined;
  const storage = { markAllNotificationsRead: async () => 5 };
  const res: any = {
    json(payload: any) {
      response = payload;
      return this;
    }
  };

  await markAllNotificationsReadHandler(storage as any, { user: { id: "user" } } as any, res, () => {});
  assert.deepEqual(response, { updated: 5 });
});
