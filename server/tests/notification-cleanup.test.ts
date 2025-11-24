import { test } from "node:test";
import assert from "node:assert/strict";
import { computeReadCutoff, isNotificationExpired, READ_RETENTION_DAYS } from "../jobs/notification-cleanup";

const DAY_MS = 24 * 60 * 60 * 1000;

test("computeReadCutoff returns now minus retention window", () => {
  const now = new Date("2025-01-10T12:00:00Z");
  const cutoff = computeReadCutoff(now);
  const expected = new Date(now.getTime() - READ_RETENTION_DAYS * DAY_MS);
  assert.equal(cutoff.toISOString(), expected.toISOString());
});

test("notifications are not deleted before 3 days have passed", () => {
  const now = new Date("2025-01-10T12:00:00Z");
  const justInsideWindow = new Date(now.getTime() - READ_RETENTION_DAYS * DAY_MS + 60 * 60 * 1000); // 1 hour short
  assert.equal(isNotificationExpired(justInsideWindow, now), false);
});

test("notifications are deleted once the 3-day threshold is reached", () => {
  const now = new Date("2025-01-10T12:00:00Z");
  const atThreshold = new Date(now.getTime() - READ_RETENTION_DAYS * DAY_MS);
  const beyondThreshold = new Date(now.getTime() - READ_RETENTION_DAYS * DAY_MS - 5 * 60 * 1000);
  assert.equal(isNotificationExpired(atThreshold, now), true);
  assert.equal(isNotificationExpired(beyondThreshold, now), true);
});

test("notifications with null readAt are not deleted", () => {
  const now = new Date("2025-01-10T12:00:00Z");
  assert.equal(isNotificationExpired(null, now), false);
  assert.equal(isNotificationExpired(undefined, now), false);
});
