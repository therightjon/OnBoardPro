import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  buildLdapUserSearchFilter,
  escapeLdapFilter,
  FIXED_LDAP_USER_FILTER_TEMPLATE,
  toLdapUsername
} from "../../features/auth/identifier";

describe("LDAP Identifier Utilities", () => {
  describe("escapeLdapFilter", () => {
    test("escapes backslash characters", () => {
      assert.equal(escapeLdapFilter("user\\name"), "user\\5cname");
    });

    test("escapes asterisk characters", () => {
      assert.equal(escapeLdapFilter("user*name"), "user\\2aname");
    });

    test("escapes left parenthesis", () => {
      assert.equal(escapeLdapFilter("user(name"), "user\\28name");
    });

    test("escapes right parenthesis", () => {
      assert.equal(escapeLdapFilter("user)name"), "user\\29name");
    });

    test("escapes null byte", () => {
      assert.equal(escapeLdapFilter("user\0name"), "user\\00name");
    });

    test("escapes multiple special characters", () => {
      assert.equal(escapeLdapFilter("a*b(c)d\\e"), "a\\2ab\\28c\\29d\\5ce");
    });

    test("returns unchanged string when no special characters", () => {
      assert.equal(escapeLdapFilter("normalusername"), "normalusername");
    });

    test("handles empty string", () => {
      assert.equal(escapeLdapFilter(""), "");
    });

    test("prevents LDAP injection attack patterns", () => {
      // Common injection patterns should be safely escaped
      const injection1 = "admin)(objectClass=*";
      assert.equal(escapeLdapFilter(injection1), "admin\\29\\28objectClass=\\2a");

      const injection2 = "*)(uid=*))(|(uid=*";
      assert.equal(escapeLdapFilter(injection2), "\\2a\\29\\28uid=\\2a\\29\\29\\28|\\28uid=\\2a");
    });
  });

  describe("toLdapUsername", () => {
    test("normalizes to lowercase", () => {
      assert.equal(toLdapUsername("TestUser"), "testuser");
    });

    test("trims whitespace", () => {
      assert.equal(toLdapUsername("  testuser  "), "testuser");
    });

    test("strips email domain", () => {
      assert.equal(toLdapUsername("alice@example.edu"), "alice");
    });

    test("handles email with uppercase domain", () => {
      assert.equal(toLdapUsername("bob.smith@EXAMPLE.ORG"), "bob.smith");
    });

    test("preserves dots in username", () => {
      assert.equal(toLdapUsername("john.doe"), "john.doe");
    });

    test("escapes special characters in username", () => {
      assert.equal(toLdapUsername("user*name"), "user\\2aname");
    });

    test("escapes injection attempts", () => {
      // User tries to inject LDAP filter syntax
      assert.equal(toLdapUsername("admin)(objectClass=*"), "admin\\29\\28objectclass=\\2a");
    });

    test("escapes injection in email format", () => {
      // User provides malicious email-like input
      assert.equal(toLdapUsername("admin*)@evil.com"), "admin\\2a\\29");
    });

    test("handles empty string", () => {
      assert.equal(toLdapUsername(""), "");
    });

    test("handles string with only whitespace", () => {
      assert.equal(toLdapUsername("   "), "");
    });
  });

  describe("buildLdapUserSearchFilter", () => {
    test("uses the fixed LDAP filter template", () => {
      assert.equal(FIXED_LDAP_USER_FILTER_TEMPLATE, "(sAMAccountName={{username}})");
    });

    test("interpolates normalized username", () => {
      assert.equal(buildLdapUserSearchFilter("Alice@EXAMPLE.EDU"), "(sAMAccountName=alice)");
    });

    test("escapes LDAP injection syntax in interpolated username", () => {
      assert.equal(
        buildLdapUserSearchFilter("admin)(objectClass=*)"),
        "(sAMAccountName=admin\\29\\28objectclass=\\2a\\29)"
      );
    });
  });
});
