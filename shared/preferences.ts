export const DIGEST_FREQUENCIES = ["immediate", "hourly", "daily", "weekly"] as const;
export type DigestFrequency = typeof DIGEST_FREQUENCIES[number];

export const EVENT_SUBSCRIPTION_KEYS = [
  "comment.created",
  "task.assigned",
  "stage.changed",
  "mention"
] as const;
export type EventSubscriptionKey = typeof EVENT_SUBSCRIPTION_KEYS[number];

export type EventSubscriptions = Record<string, boolean>;

export type UserPreferencesDTO = {
  mytasksShowArchived: boolean;
  mytasksShowCanceled: boolean;
  mytasksShowCompleted: boolean;
  notifyInApp: boolean;
  notifyEmail: boolean;
  digestFrequency: DigestFrequency;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  allowSelfNotifications: boolean;
  eventSubscriptions: EventSubscriptions;
};

export const USER_PREFERENCES_DEFAULTS: UserPreferencesDTO = {
  mytasksShowArchived: false,
  mytasksShowCanceled: false,
  mytasksShowCompleted: false,
  notifyInApp: true,
  notifyEmail: false,
  digestFrequency: DIGEST_FREQUENCIES[0],
  quietHoursStart: null as string | null,
  quietHoursEnd: null as string | null,
  allowSelfNotifications: false,
  eventSubscriptions: EVENT_SUBSCRIPTION_KEYS.reduce<EventSubscriptions>((acc, key) => {
    acc[key] = true;
    return acc;
  }, {}),
};

export const EVENT_SUBSCRIPTION_LABELS: Record<EventSubscriptionKey, string> = {
  "comment.created": "Comments on my tasks",
  "task.assigned": "Task assignments",
  "stage.changed": "Stage changes",
  "mention": "Mentions",
};

export function mergeUserPreferences(preferences?: Partial<UserPreferencesDTO> | null): UserPreferencesDTO {
  return {
    ...USER_PREFERENCES_DEFAULTS,
    ...(preferences ?? {}),
    eventSubscriptions: {
      ...USER_PREFERENCES_DEFAULTS.eventSubscriptions,
      ...(preferences?.eventSubscriptions ?? {}),
    },
  };
}
