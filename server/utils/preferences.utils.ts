import {
  USER_PREFERENCES_DEFAULTS,
  mergeUserPreferences,
  type UserPreferences,
  type UserPreferencesDTO
} from "@shared/schemas";

export const PREFERENCE_KEYS = [
  "mytasksShowArchived",
  "mytasksShowCanceled",
  "mytasksShowCompleted",
  "notifyInApp",
  "notifyEmail",
  "digestFrequency",
  "quietHoursStart",
  "quietHoursEnd",
  "allowSelfNotifications",
  "eventSubscriptions"
] as const;

type PreferenceKey = (typeof PREFERENCE_KEYS)[number];

const candidatePreferenceKeys = new Set<PreferenceKey>(PREFERENCE_KEYS);
const defaultPreferenceKeys = new Set<PreferenceKey>(PREFERENCE_KEYS);

type PreferencesResponse = typeof USER_PREFERENCES_DEFAULTS & {
  eventSubscriptions: Record<string, boolean>;
};

type UserPreferencesUpdate = Partial<Omit<UserPreferences, "userId" | "updatedAt">>;

/**
 * Gets the allowed preference keys for a given role
 * @param role - The user's role
 * @returns Set of allowed preference keys
 */
export function getAllowedPreferenceKeys(role: string): Set<PreferenceKey> {
  return role === "candidate" ? candidatePreferenceKeys : defaultPreferenceKeys;
}

/**
 * Builds a preference response object by merging user preferences with defaults
 * @param preferences - The user's preferences (optional)
 * @returns Complete preferences response with defaults filled in
 */
export function buildPreferenceResponse(preferences?: UserPreferences): PreferencesResponse {
  const merged = mergeUserPreferences(preferences as Partial<UserPreferencesDTO> | undefined);
  return {
    ...merged,
    eventSubscriptions: { ...merged.eventSubscriptions }
  };
}

/**
 * Filters preferences to only include keys allowed for the given role
 * @param preferences - The full preferences object
 * @param role - The user's role
 * @returns Filtered preferences object with only allowed keys
 */
export function pickPreferencesForRole(preferences: PreferencesResponse, role: string) {
  const allowedKeys = getAllowedPreferenceKeys(role);
  return Array.from(allowedKeys).reduce<Record<string, unknown>>((acc, key) => {
    acc[key] = preferences[key as keyof PreferencesResponse];
    return acc;
  }, {});
}

/**
 * Filters preference updates to only include keys allowed for the given role
 * @param updates - The preference updates to filter
 * @param role - The user's role
 * @returns Filtered preference updates with only allowed keys
 */
export function filterUpdatesForRole(updates: Record<string, any>, role: string): UserPreferencesUpdate {
  const allowedKeys = getAllowedPreferenceKeys(role);
  return Object.entries(updates).reduce<UserPreferencesUpdate>((acc, [key, value]) => {
    if (allowedKeys.has(key as PreferenceKey)) {
      acc[key as PreferenceKey] = value as any;
    }
    return acc;
  }, {} as UserPreferencesUpdate);
}
