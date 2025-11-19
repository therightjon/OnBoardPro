import { describe, it, expect } from "vitest";
import { formatUnreadCount } from "../src/features/notifications/utils";

describe("formatUnreadCount", () => {
  it("hides badge at zero", () => {
    const result = formatUnreadCount(0);
    expect(result.count).toBe(0);
    expect(result.showBadge).toBe(false);
    expect(result.badgeText).toBe("0");
    expect(result.announcement).toBe("0 unread notifications");
  });

  it("shows single digits", () => {
    const result = formatUnreadCount(9);
    expect(result.count).toBe(9);
    expect(result.showBadge).toBe(true);
    expect(result.badgeText).toBe("9");
  });

  it("preserves two digits", () => {
    const result = formatUnreadCount(10);
    expect(result.count).toBe(10);
    expect(result.badgeText).toBe("10");
  });

  it("caps at 99 plus", () => {
    const ninetyNine = formatUnreadCount(99);
    expect(ninetyNine.badgeText).toBe("99");
    expect(ninetyNine.showBadge).toBe(true);

    const overMax = formatUnreadCount(100);
    expect(overMax.count).toBe(100);
    expect(overMax.badgeText).toBe("99+");
  });

  it("handles one", () => {
    const result = formatUnreadCount(1);
    expect(result.count).toBe(1);
    expect(result.badgeText).toBe("1");
    expect(result.announcement).toBe("1 unread notification");
  });

  it("handles nullish", () => {
    const resultNull = formatUnreadCount(null);
    expect(resultNull.count).toBe(0);
    expect(resultNull.showBadge).toBe(false);

    const resultUndefined = formatUnreadCount(undefined);
    expect(resultUndefined.count).toBe(0);
    expect(resultUndefined.showBadge).toBe(false);
  });
});
