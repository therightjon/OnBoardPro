// Helper for normalizing user-provided identifiers before LDAP authentication.
// Examples:
//  toLdapUsername("  TestUser ") => "testuser"
//  toLdapUsername("Alice@example.edu") => "alice"
//  toLdapUsername("bob.smith@EXAMPLE.ORG") => "bob.smith"

export function toLdapUsername(input: string): string {
  const normalized = input.trim().toLowerCase();
  const atIndex = normalized.indexOf("@");
  return atIndex >= 0 ? normalized.slice(0, atIndex) : normalized;
}
