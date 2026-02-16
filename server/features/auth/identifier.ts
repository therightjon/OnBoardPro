// Helper for normalizing user-provided identifiers before LDAP authentication.
// Examples:
//  toLdapUsername("  TestUser ") => "testuser"
//  toLdapUsername("Alice@example.edu") => "alice"
//  toLdapUsername("bob.smith@EXAMPLE.ORG") => "bob.smith"

export const FIXED_LDAP_USER_FILTER_TEMPLATE = "(sAMAccountName={{username}})";

/**
 * Escapes LDAP special characters in a filter value to prevent LDAP injection attacks.
 * Per RFC 4515, these characters must be escaped in LDAP search filters:
 * - \ (backslash) -> \5c
 * - * (asterisk) -> \2a
 * - ( (left paren) -> \28
 * - ) (right paren) -> \29
 * - NUL (null byte) -> \00
 * 
 * @param input - The raw user input to escape
 * @returns The escaped string safe for use in LDAP filters
 */
export function escapeLdapFilter(input: string): string {
  return input
    .replace(/\\/g, '\\5c')  // Backslash must be escaped first
    .replace(/\*/g, '\\2a')
    .replace(/\(/g, '\\28')
    .replace(/\)/g, '\\29')
    .replace(/\0/g, '\\00');
}

/**
 * Normalizes and escapes a user-provided identifier for safe use in LDAP filters.
 * - Trims whitespace
 * - Converts to lowercase
 * - Strips email domain if present
 * - Escapes LDAP special characters
 * 
 * @param input - The raw user input (username or email)
 * @returns A normalized, escaped username safe for LDAP filter interpolation
 */
export function toLdapUsername(input: string): string {
  const normalized = input.trim().toLowerCase();
  const atIndex = normalized.indexOf("@");
  const username = atIndex >= 0 ? normalized.slice(0, atIndex) : normalized;
  return escapeLdapFilter(username);
}

/**
 * Builds the LDAP user search filter from the fixed template.
 *
 * @param input - Raw username or email identifier
 * @returns LDAP filter with escaped username interpolation
 */
export function buildLdapUserSearchFilter(input: string): string {
  return FIXED_LDAP_USER_FILTER_TEMPLATE.replace(/\{\{username\}\}/g, toLdapUsername(input));
}
