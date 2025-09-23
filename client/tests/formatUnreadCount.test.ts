import { test } from "node:test";
import assert from "node:assert/strict";
import { formatUnreadCount } from "../src/features/notifications/utils";

test("formatUnreadCount hides badge at zero", () => {
  const result = formatUnreadCount(0);
  assert.equal(result.count, 0);
  assert.equal(result.showBadge, false);
  assert.equal(result.badgeText, "0");
  assert.equal(result.announcement, "0 unread notifications");
});

test("formatUnreadCount shows single digits", () => {
  const result = formatUnreadCount(9);
  assert.equal(result.count, 9);
  assert.equal(result.showBadge, true);
  assert.equal(result.badgeText, "9");
});

test("formatUnreadCount preserves two digits", () => {
  const result = formatUnreadCount(10);
  assert.equal(result.count, 10);
  assert.equal(result.badgeText, "10");
});

test("formatUnreadCount caps at 99 plus", () => {
  const ninetyNine = formatUnreadCount(99);
  assert.equal(ninetyNine.badgeText, "99");
  assert.equal(ninetyNine.showBadge, true);

  const overMax = formatUnreadCount(100);
  assert.equal(overMax.count, 100);
  assert.equal(overMax.badgeText, "99+");
});

test("formatUnreadCount handles one", () => {
  const result = formatUnreadCount(1);
  assert.equal(result.count, 1);
  assert.equal(result.badgeText, "1");
  assert.equal(result.announcement, "1 unread notification");
});

test("formatUnreadCount handles nullish", () => {
  const resultNull = formatUnreadCount(null);
  assert.equal(resultNull.count, 0);
  assert.equal(resultNull.showBadge, false);

  const resultUndefined = formatUnreadCount(undefined);
  assert.equal(resultUndefined.count, 0);
  assert.equal(resultUndefined.showBadge, false);
});
