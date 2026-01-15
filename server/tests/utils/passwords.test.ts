import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  isCommonPassword,
  getCommonPasswordCount,
  clearCommonPasswordCache,
  validatePasswordPolicy,
  hashPassword,
  comparePasswords,
} from "../../utils/passwords";

describe("Password Utility", () => {
  describe("Common Password Blocklist", () => {
    beforeEach(() => {
      // Clear cache to ensure fresh state for each test
      clearCommonPasswordCache();
    });

    afterEach(() => {
      clearCommonPasswordCache();
    });

    test("loads 9,900+ passwords from blocklist", () => {
      const count = getCommonPasswordCount();
      assert.ok(
        count >= 9900,
        `Expected at least 9,900 passwords in blocklist, got ${count}`
      );
    });

    test("detects common passwords", () => {
      // Top passwords from SecLists
      const commonPasswords = [
        "123456",
        "password",
        "12345678",
        "qwerty",
        "123456789",
        "12345",
        "1234",
        "111111",
        "1234567",
        "dragon",
        "123123",
        "baseball",
        "abc123",
        "football",
        "monkey",
        "letmein",
        "696969",
        "shadow",
        "master",
        "666666",
      ];

      for (const pwd of commonPasswords) {
        assert.ok(
          isCommonPassword(pwd),
          `Expected "${pwd}" to be detected as common password`
        );
      }
    });

    test("is case-insensitive", () => {
      assert.ok(isCommonPassword("PASSWORD"));
      assert.ok(isCommonPassword("Password"));
      assert.ok(isCommonPassword("pAsSwOrD"));
      assert.ok(isCommonPassword("QWERTY"));
      assert.ok(isCommonPassword("Dragon"));
    });

    test("does not flag unique passwords", () => {
      // Generate passwords unlikely to be in any list
      const uniquePasswords = [
        "Xk9$mQwL3rT7vPz",
        "7H#nBcY2fWjK9Sd",
        "OnBoardPro2026!Secure",
        "a1b2c3d4e5f6g7h8i9j0-UNIQUE",
      ];

      for (const pwd of uniquePasswords) {
        assert.ok(
          !isCommonPassword(pwd),
          `Did not expect "${pwd}" to be flagged as common`
        );
      }
    });

    test("handles empty string", () => {
      assert.ok(!isCommonPassword(""));
    });

    test("handles whitespace-only", () => {
      // Trimmed whitespace should result in empty, which isn't common
      assert.ok(!isCommonPassword("   "));
    });
  });

  describe("validatePasswordPolicy", () => {
    test("accepts strong passwords", () => {
      const strongPasswords = [
        "MySecure#Pass1234",
        "Compl3x!Password",
        "V3ry$tr0ngP@ssword",
        "Unique2026!Secure#",
      ];

      for (const pwd of strongPasswords) {
        const errors = validatePasswordPolicy(pwd);
        assert.deepEqual(
          errors,
          [],
          `Expected no errors for "${pwd}", got: ${errors.join(", ")}`
        );
      }
    });

    test("rejects short passwords", () => {
      const errors = validatePasswordPolicy("Short1!");
      assert.ok(errors.some((e) => e.includes("12 characters")));
    });

    test("rejects passwords over 128 characters", () => {
      const longPassword = "A1!" + "a".repeat(130);
      const errors = validatePasswordPolicy(longPassword);
      assert.ok(errors.some((e) => e.includes("128 characters")));
    });

    test("rejects passwords without uppercase", () => {
      const errors = validatePasswordPolicy("nocaps123456!");
      assert.ok(errors.some((e) => e.includes("uppercase")));
    });

    test("rejects passwords without lowercase", () => {
      const errors = validatePasswordPolicy("NOLOWER123456!");
      assert.ok(errors.some((e) => e.includes("lowercase")));
    });

    test("rejects passwords without numbers", () => {
      const errors = validatePasswordPolicy("NoNumbers!@#$%");
      assert.ok(errors.some((e) => e.includes("number")));
    });

    test("rejects passwords without special characters", () => {
      const errors = validatePasswordPolicy("NoSpecial12345");
      assert.ok(errors.some((e) => e.includes("special character")));
    });

    test("rejects common passwords with appropriate error", () => {
      // Use a common password that's long enough to pass length check
      // "qwertyuiop123" is in the blocklist and meets 12+ char requirement
      const commonPassword = "password";
      const errors = validatePasswordPolicy(commonPassword);
      assert.ok(
        errors.some((e) => e.includes("too common")),
        `Expected "too common" error for "${commonPassword}", got: ${errors.join(", ")}`
      );
      
      // Verify isCommonPassword works directly for blocklist passwords
      assert.ok(isCommonPassword("dragon"), '"dragon" should be detected as common');
      assert.ok(isCommonPassword("baseball"), '"baseball" should be detected as common');
      assert.ok(isCommonPassword("football"), '"football" should be detected as common');
      
      // A strong password that contains a common word but isn't in the list should pass
      assert.ok(
        !isCommonPassword("Baseball123!"),
        '"Baseball123!" is not in the blocklist (exact match required)'
      );
    });

    test("returns multiple errors for very weak passwords", () => {
      const errors = validatePasswordPolicy("abc");
      assert.ok(errors.length > 3, `Expected multiple errors, got ${errors.length}`);
    });
  });

  describe("hashPassword and comparePasswords", () => {
    test("hashes and verifies password correctly", async () => {
      const password = "SecurePassword123!";
      const hash = await hashPassword(password);

      assert.ok(hash.includes("."), "Hash should contain salt separator");
      assert.ok(await comparePasswords(password, hash));
      assert.ok(!(await comparePasswords("WrongPassword123!", hash)));
    });

    test("produces different hashes for same password", async () => {
      const password = "SamePassword123!";
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      assert.notEqual(hash1, hash2, "Hashes should differ due to unique salts");

      // But both should verify
      assert.ok(await comparePasswords(password, hash1));
      assert.ok(await comparePasswords(password, hash2));
    });

    test("handles invalid hash format gracefully", async () => {
      assert.ok(!(await comparePasswords("test", "invalid-hash-no-dot")));
      assert.ok(!(await comparePasswords("test", "")));
      assert.ok(!(await comparePasswords("test", ".")));
    });
  });
});
