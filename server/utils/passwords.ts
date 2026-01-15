import { randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import bcrypt from "bcrypt";

const scryptAsync = promisify(scrypt);

// Minimal banlist to block very common passwords
const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "123456",
  "123456789",
  "qwerty",
  "abc123",
  "letmein",
  "welcome",
  "admin",
  "iloveyou",
  "monkey",
  "dragon",
  "football",
  "baseball",
  "111111",
  "123123"
]);

export function validatePasswordPolicy(password: string): string[] {
  const errors: string[] = [];
  if (password.length < 12) errors.push("Password must be at least 12 characters");
  if (password.length > 128) errors.push("Password must not exceed 128 characters");
  if (!/[A-Z]/.test(password)) errors.push("Password must include an uppercase letter");
  if (!/[a-z]/.test(password)) errors.push("Password must include a lowercase letter");
  if (!/[0-9]/.test(password)) errors.push("Password must include a number");
  if (!/[^A-Za-z0-9]/.test(password)) errors.push("Password must include a special character");
  if (COMMON_PASSWORDS.has(password.toLowerCase())) errors.push("Password is too common");
  return errors;
}

export function assertPasswordPolicy(password: string): void {
  const errors = validatePasswordPolicy(password);
  if (errors.length > 0) {
    throw new Error(errors.join("; "));
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

/**
 * Compare supplied password against stored hash.
 * Handles bcrypt (legacy) and scrypt (new format); returns false on format errors to avoid timing leaks.
 * Uses constant-time comparison to prevent timing attacks.
 */
export async function comparePasswords(supplied: string, stored: string): Promise<boolean> {
  try {
    // Check if it's a bcrypt hash (existing format)
    if (stored.startsWith('$2')) {
      return await bcrypt.compare(supplied, stored);
    }

    // Handle scrypt format (hash.salt)
    // Salt may contain dots, so only split on first dot
    const dotIndex = stored.indexOf(".");
    // Continue processing even if format is wrong to maintain constant timing
    const hashed = dotIndex > 0 ? stored.substring(0, dotIndex) : "";
    const salt = dotIndex > 0 ? stored.substring(dotIndex + 1) : "dummysalt";

    // Always compute hash even if inputs are invalid to maintain constant timing
    const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;

    // Validate format after timing-sensitive operations
    if (dotIndex <= 0 || !hashed || !salt) {
      // Still return false but after performing the hash computation
      return false;
    }

    const hashedBuf = Buffer.from(hashed, "hex");

    if (hashedBuf.length !== suppliedBuf.length) {
      // Length mismatch - return false after timing-sensitive operations
      return false;
    }

    return timingSafeEqual(hashedBuf, suppliedBuf);
  } catch (error) {
    // Perform dummy operation to maintain timing even in error case
    try {
      await scryptAsync("dummy", "dummysalt", 64);
    } catch {
      // Ignore errors in dummy operation
    }
    console.error("Error comparing passwords:", error);
    return false;
  }
}
