import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from "crypto";

// Simple secret helper using AES-256-GCM with scrypt-derived key.
// Format: enc:v1:<salt_b64>:<iv_b64>:<cipher_b64>:<tag_b64>

function getSecretPassphrase(): string | undefined {
  return process.env.LDAP_SECRET_KEY || process.env.SECRET_ENC_KEY || process.env.SESSION_SECRET;
}

export function isEncrypted(value?: string | null): boolean {
  return !!value && value.startsWith("enc:v1:");
}

export function encryptSecret(plain: string): string {
  const passphrase = getSecretPassphrase();
  if (!passphrase) {
    // Fallback to storing plaintext with explicit prefix
    return `plain:${plain}`;
  }

  const salt = randomBytes(16);
  const key = scryptSync(passphrase, salt, 32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `enc:v1:${salt.toString("base64")}:${iv.toString("base64")}:${ciphertext.toString("base64")}:${tag.toString("base64")}`;
}

export function decryptSecret(stored?: string | null): string | undefined {
  if (!stored) return undefined;
  if (stored.startsWith("plain:")) return stored.slice("plain:".length);
  if (!isEncrypted(stored)) return stored;

  const passphrase = getSecretPassphrase();
  if (!passphrase) {
    // Cannot decrypt without key
    return undefined;
  }

  try {
    const [, , saltB64, ivB64, cipherB64, tagB64] = stored.split(":");
    const salt = Buffer.from(saltB64, "base64");
    const iv = Buffer.from(ivB64, "base64");
    const ciphertext = Buffer.from(cipherB64, "base64");
    const tag = Buffer.from(tagB64, "base64");

    const key = scryptSync(passphrase, salt, 32);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    return plain;
  } catch (error) {
    // Decryption failed - likely due to key mismatch (e.g., SESSION_SECRET changed)
    // Return undefined to indicate the secret is not available and needs to be re-entered
    console.warn("Failed to decrypt secret - encryption key may have changed. Password needs to be re-entered.");
    return undefined;
  }
}

export function maskValue(s?: string): string | undefined {
  if (!s) return undefined;
  const last4 = s.slice(-4);
  return `${"x".repeat(Math.max(0, s.length - 4))}${last4}`;
}

