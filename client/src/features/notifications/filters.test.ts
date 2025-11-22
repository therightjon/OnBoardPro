import { describe, expect, it } from "vitest";
import { getNotificationFilter, NOTIFICATION_FILTERS } from "./filters";

describe("notifications filters", () => {
  it("returns a filter by key", () => {
    const filter = getNotificationFilter("comments");
    expect(filter.key).toBe("comments");
    expect(filter.types).toEqual(["comment.created"]);
  });

  it("falls back to the first filter when key is unknown", () => {
    const filter = getNotificationFilter("unknown" as any);
    expect(filter.key).toBe(NOTIFICATION_FILTERS[0].key);
  });
});
