const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off", ""]);

/**
 * Parses a boolean feature flag from an environment variable.
 * Invalid values fall back to the provided default.
 */
export function parseBooleanFlag(value: string | undefined, defaultValue = false): boolean {
  if (value === undefined) return defaultValue;

  const normalized = value.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;

  return defaultValue;
}

export function isInvitationsEnabled(): boolean {
  return parseBooleanFlag(process.env.ENABLE_INVITATIONS, false);
}
