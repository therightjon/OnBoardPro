const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

function parseClientBooleanFlag(value: string | boolean | undefined, defaultValue = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return defaultValue;
  return TRUE_VALUES.has(value.trim().toLowerCase());
}

export function isInvitationsEnabled(): boolean {
  return parseClientBooleanFlag(import.meta.env.VITE_ENABLE_INVITATIONS, false);
}
