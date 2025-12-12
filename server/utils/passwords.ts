import { randomBytes, scrypt } from "crypto";
import { promisify } from "util";

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
