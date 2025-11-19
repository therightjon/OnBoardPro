import { randomBytes } from "crypto";

const INVITE_TOKEN_BYTES = 32;

/**
 * Generates a secure random invitation token
 * @returns URL-safe base64-encoded random token
 */
export function generateInviteToken(): string {
  const raw = randomBytes(INVITE_TOKEN_BYTES).toString("base64");
  return raw.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Gets the base URL for invitation links from environment variables
 * Falls back to localhost:5173 if no environment variable is set
 * @returns The base URL without trailing slash
 */
export function getInviteBaseUrl(): string {
  const value = process.env.APP_BASE_URL
    || process.env.PUBLIC_URL
    || process.env.CLIENT_URL
    || process.env.VITE_APP_URL;
  return value ? value.replace(/\/$/, "") : "http://localhost:5173";
}

/**
 * Sends an invitation email with the invite link
 * Currently logs the invitation details to console
 * @param email - The recipient's email address
 * @param token - The invitation token
 * @param expiresAt - When the invitation expires
 */
export async function sendInviteEmail(email: string, token: string, expiresAt: Date) {
  const link = `${getInviteBaseUrl()}/accept-invite?token=${token}`;
  console.info(`[invite] Sent invitation`, { email, link, expiresAt: expiresAt.toISOString() });
}
