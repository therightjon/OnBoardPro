import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";
import type { SmtpEncryptedSecretPayload } from "@shared/schemas";

const ENCRYPTION_VERSION = "v1";
const ROOT_KEY_ENV = "APP_KMS_ROOT_KEY";
const FALLBACK_KEYS_ENV = "APP_KMS_ROOT_KEY_FALLBACKS";

function decodeKeyMaterial(value: string): Buffer {
  if (!value) {
    throw new Error("Envelope encryption root key is not configured");
  }

  const trimmed = value.trim();
  // Attempt base64 decode
  try {
    const buf = Buffer.from(trimmed, "base64");
    if (buf.length === 16 || buf.length === 24 || buf.length === 32) {
      return buf;
    }
  } catch {
    // ignore
  }

  // Attempt hex decode
  const hexMatch = /^[0-9a-fA-F]+$/.test(trimmed);
  if (hexMatch && trimmed.length % 2 === 0) {
    const buf = Buffer.from(trimmed, "hex");
    if (buf.length === 16 || buf.length === 24 || buf.length === 32) {
      return buf;
    }
  }

  // Fallback to SHA-256 of the value
  return createHash("sha256").update(trimmed, "utf8").digest();
}

export function loadEnvelopeRootKeys(): Buffer[] {
  const primary = process.env[ROOT_KEY_ENV];
  if (!primary) {
    throw new Error("APP_KMS_ROOT_KEY must be set for SMTP envelope encryption");
  }

  const keys: Buffer[] = [decodeKeyMaterial(primary)];
  const fallbackRaw = process.env[FALLBACK_KEYS_ENV];
  if (fallbackRaw) {
    for (const entry of fallbackRaw.split(",").map((v) => v.trim()).filter(Boolean)) {
      keys.push(decodeKeyMaterial(entry));
    }
  }
  return keys;
}

function aesGcmEncrypt(key: Buffer, payload: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv, ciphertext, tag };
}

function aesGcmDecrypt(key: Buffer, iv: Buffer, tag: Buffer, ciphertext: Buffer) {
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export interface EnvelopeEncryptionResult {
  version: string;
  payload: SmtpEncryptedSecretPayload;
  passwordSetAt: Date;
}

export function encryptEnvelopeSecret(plain: string): EnvelopeEncryptionResult {
  if (!plain) {
    throw new Error("Cannot encrypt empty secret");
  }

  const [primaryKey] = loadEnvelopeRootKeys();
  if (primaryKey.length !== 32) {
    throw new Error("Envelope encryption requires a 256-bit (32-byte) root key");
  }

  const dataKey = randomBytes(32);
  const secretBytes = Buffer.from(plain, "utf8");
  const secretEnc = aesGcmEncrypt(dataKey, secretBytes);
  const wrappedKeyEnc = aesGcmEncrypt(primaryKey, dataKey);

  return {
    version: ENCRYPTION_VERSION,
    passwordSetAt: new Date(),
    payload: {
      wrappedKey: wrappedKeyEnc.ciphertext.toString("base64"),
      wrappedKeyIv: wrappedKeyEnc.iv.toString("base64"),
      wrappedKeyTag: wrappedKeyEnc.tag.toString("base64"),
      ciphertext: secretEnc.ciphertext.toString("base64"),
      iv: secretEnc.iv.toString("base64"),
      tag: secretEnc.tag.toString("base64")
    }
  };
}

export function decryptEnvelopeSecret(payload: SmtpEncryptedSecretPayload, options?: { rootKeys?: Buffer[] }): string {
  if (!payload) {
    throw new Error("Missing encrypted payload");
  }

  const rootKeys = options?.rootKeys ?? loadEnvelopeRootKeys();
  const wrappedKey = Buffer.from(payload.wrappedKey, "base64");
  const wrappedKeyIv = Buffer.from(payload.wrappedKeyIv, "base64");
  const wrappedKeyTag = Buffer.from(payload.wrappedKeyTag, "base64");

  for (const rootKey of rootKeys) {
    try {
      const dataKey = aesGcmDecrypt(rootKey, wrappedKeyIv, wrappedKeyTag, wrappedKey);
      const plaintext = aesGcmDecrypt(
        dataKey,
        Buffer.from(payload.iv, "base64"),
        Buffer.from(payload.tag, "base64"),
        Buffer.from(payload.ciphertext, "base64")
      );
      return plaintext.toString("utf8");
    } catch (error) {
      // Try next key
      continue;
    }
  }

  throw new Error("Unable to decrypt secret with available root keys");
}

export function redactSecretForLogs(value?: string | null): string | undefined {
  if (!value) return undefined;
  const visible = value.slice(-4);
  return `${"*".repeat(Math.max(0, value.length - 4))}${visible}`;
}
