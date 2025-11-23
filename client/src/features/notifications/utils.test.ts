import { describe, expect, it } from "vitest";
import { mapNotificationToDisplay } from "./utils";
import type { NotificationRecord } from "./types";

const baseNotification: Partial<NotificationRecord> = {
  id: "notif-1",
  userId: "user-1",
  entityType: "task",
  entityId: "task-1",
  isRead: false,
  readAt: null,
  createdAt: new Date().toISOString(),
};

describe("mapNotificationToDisplay", () => {
  it("maps task assignments to My Tasks with candidate context", () => {
    const notification: NotificationRecord = {
      ...baseNotification,
      type: "task.assigned",
      payload: {
        task: { id: "task-1", title: "Prepare offer" },
        candidate: { id: "cand-1", name: "Jane Doe" },
        reason: "assignment",
      },
    } as NotificationRecord;

    const display = mapNotificationToDisplay(notification);
    expect(display.title).toContain("Task \"Prepare offer\"");
    expect(display.body).toContain("Candidate Jane Doe");
    expect(display.link).toBe("/tasks/mine?taskId=task-1");
  });

  it("handles candidate owner changes with readable copy", () => {
    const notification: NotificationRecord = {
      ...baseNotification,
      type: "candidate.owner_changed",
      entityType: "candidate",
      entityId: "cand-2",
      payload: {
        candidate: { id: "cand-2", name: "Alex Smith" },
        variant: "new",
      },
    } as NotificationRecord;

    const display = mapNotificationToDisplay(notification);
    expect(display.title).toContain("Alex Smith");
    expect(display.link).toBe("/candidates/cand-2");
  });

  it("falls back to legacy payload title/message", () => {
    const notification: NotificationRecord = {
      ...baseNotification,
      type: "task.completed",
      payload: {
        title: "Legacy title",
        message: "Legacy message",
        contextCandidateId: "cand-3",
      },
    } as NotificationRecord;

    const display = mapNotificationToDisplay(notification);
      expect(display.title).toBe("Legacy title");
      expect(display.body).toBe("Legacy message");
      expect(display.link).toBe("/candidates/cand-3");
  });

  it("uses taskTitle fallback when task object is missing", () => {
    const notification: NotificationRecord = {
      ...baseNotification,
      type: "task.assigned",
      payload: {
        taskTitle: "Fallback Task",
        candidate: { id: "cand-4", name: "Fallback Cand" }
      },
    } as NotificationRecord;

    const display = mapNotificationToDisplay(notification);
    expect(display.title).toContain("Fallback Task");
  });

  it("uses legacy title/message for task.assigned when no task object", () => {
    const notification: NotificationRecord = {
      ...baseNotification,
      type: "task.assigned",
      payload: {
        title: "Legacy assigned title",
        message: "Legacy assigned message",
        contextCandidateId: "cand-5"
      }
    } as NotificationRecord;

    const display = mapNotificationToDisplay(notification);
    expect(display.title).toContain("Legacy assigned title");
    expect(display.body).toBe("Legacy assigned message");
  });
});
