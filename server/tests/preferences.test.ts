import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPreferenceResponse,
  filterUpdatesForRole,
  pickPreferencesForRole,
  preferencesUpdateSchema,
  PREFERENCE_KEYS,
} from "../routes";
import {
  EVENT_SUBSCRIPTION_KEYS,
  mergeUserPreferences,
  type UserPreferencesDTO,
} from "@shared/preferences";

function applyUpdates(base: UserPreferencesDTO, updates: Partial<UserPreferencesDTO>): UserPreferencesDTO {
  return mergeUserPreferences({
    ...base,
    ...updates,
    eventSubscriptions: updates.eventSubscriptions
      ? { ...base.eventSubscriptions, ...updates.eventSubscriptions }
      : base.eventSubscriptions,
    quietHoursStart:
      Object.hasOwn(updates, "quietHoursStart") && updates.quietHoursStart !== undefined
        ? updates.quietHoursStart
        : base.quietHoursStart,
    quietHoursEnd:
      Object.hasOwn(updates, "quietHoursEnd") && updates.quietHoursEnd !== undefined
        ? updates.quietHoursEnd
        : base.quietHoursEnd,
  });
}

test("GET /api/me/preferences returns defaults with all fields", () => {
  const response = buildPreferenceResponse(undefined);
  const keys = Object.keys(response).sort();
  assert.deepEqual(keys, [...PREFERENCE_KEYS].sort());

  assert.equal(response.allowSelfNotifications, false, "default allowSelfNotifications should be false");

  const candidateView = pickPreferencesForRole(response, "candidate");
  for (const key of PREFERENCE_KEYS) {
    assert.ok(key in candidateView, `response should include ${key}`);
  }

  for (const eventKey of EVENT_SUBSCRIPTION_KEYS) {
    assert.equal(response.eventSubscriptions[eventKey], true, `default ${eventKey} should be true`);
  }
});

test("PATCH /api/me/preferences merges updates and preserves existing values", () => {
  const existing = mergeUserPreferences({
    mytasksShowArchived: true,
    notifyInApp: true,
    notifyEmail: false,
    digestFrequency: "immediate",
    eventSubscriptions: {
      mention: false,
    },
  });

  const rawUpdates = preferencesUpdateSchema.parse({
    notifyEmail: true,
    eventSubscriptions: { "task.assigned": false },
  });
  const filtered = filterUpdatesForRole(rawUpdates, "manager");
  const merged = applyUpdates(existing, filtered);

  assert.equal(merged.mytasksShowArchived, true, "should keep existing task visibility setting");
  assert.equal(merged.notifyEmail, true, "should apply email update");
  assert.equal(merged.notifyInApp, true, "should retain in-app setting");
  assert.equal(merged.allowSelfNotifications, existing.allowSelfNotifications, "should retain self-notification setting");
  assert.equal(merged.eventSubscriptions["task.assigned"], false, "should update assigned subscription");
  assert.equal(merged.eventSubscriptions.mention, false, "should retain mention override");
  for (const eventKey of EVENT_SUBSCRIPTION_KEYS) {
    assert.ok(
      merged.eventSubscriptions[eventKey] !== undefined,
      `merged event subscriptions should include key ${eventKey}`
    );
  }
});

test("PATCH schema normalizes quiet hour clears", () => {
  const parsed = preferencesUpdateSchema.parse({
    quietHoursStart: "",
    quietHoursEnd: null,
  });
  assert.equal(parsed.quietHoursStart, null);
  assert.equal(parsed.quietHoursEnd, null);
});
