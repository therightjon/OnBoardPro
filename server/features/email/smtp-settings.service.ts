import { eq } from "drizzle-orm";
import nodemailer, { type Transporter } from "nodemailer";
import SMTPTransport from "nodemailer/lib/smtp-transport";
import { z } from "zod";
import { db } from "../../db/connection";
import {
  smtpSettings as smtpSettingsTable,
  systemSettings as systemSettingsTable,
  type SmtpSettings,
  type SmtpEncryptedSecretPayload,
} from "@shared/schemas";
import { encryptEnvelopeSecret, decryptEnvelopeSecret } from "../../utils/envelope";
import { writeAuditLog } from "../../services/shared/audit-logger";
import { logger } from "../../utils/logger";

const SETTINGS_ID = "primary";
const SMTP_TLS_SETTINGS_KEY = "smtp.tls";
const CACHE_TTL_MS = 5 * 60 * 1000;

type SecurityOption = "none" | "starttls" | "ssl_tls";
type AuthOption = "none" | "plain" | "login" | "cram_md5" | "xoauth2";
type SmtpAuth = NonNullable<SMTPTransport.Options["auth"]>;

const hostRegex = /^(?!-)(?:[a-zA-Z0-9-]{0,62}[a-zA-Z0-9]\.)+[a-zA-Z]{2,63}$|^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?!$)|$)){4}$/;

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  hostname: z.string().trim().min(1, "Hostname is required")
    .refine((value) => hostRegex.test(value), "Hostname must be a valid domain or IPv4 address")
    .nullable()
    .optional(),
  port: z.number().int().min(1).max(65535).optional(),
  security: z.enum(["none", "starttls", "ssl_tls"]).optional(),
  authType: z.enum(["none", "plain", "login", "cram_md5", "xoauth2"]).optional(),
  username: z.string().trim().min(1, "Username is required").nullable().optional(),
  fromName: z.string().trim().min(1, "From name is required").nullable().optional(),
  fromEmail: z.string().trim().email("From email must be valid").nullable().optional(),
  allowHeaderSpoofing: z.boolean().optional(),
  verifyTlsCert: z.boolean().optional(),
  rateLimitPerMinute: z.number().int().min(1).max(1000).optional(),
  rateLimitPerHour: z.number().int().min(1).max(10000).optional(),
  replacePassword: z.boolean().optional(),
  newPassword: z.string().min(1, "Password cannot be empty").optional()
}).refine((data) => !(data.replacePassword && data.authType === "none"), {
  message: "Authentication must be enabled to set a password",
  path: ["newPassword"],
});

type UpdateInput = z.infer<typeof updateSchema>;

export interface PublicSmtpSettings {
  enabled: boolean;
  hostname: string | null;
  port: number | null;
  security: SecurityOption;
  authType: AuthOption;
  username: string | null;
  fromName: string | null;
  fromEmail: string | null;
  allowHeaderSpoofing: boolean;
  verifyTlsCert: boolean;
  rateLimitPerMinute: number;
  rateLimitPerHour: number;
  passwordConfigured: boolean;
  passwordSetAt: string | null;
  encryptionVersion: string | null;
  updatedAt: string;
}

export interface MaterializedSmtpSettings {
  enabled: boolean;
  hostname: string | null;
  port: number | null;
  security: SecurityOption;
  authType: AuthOption;
  username: string | null;
  password?: string;
  fromName: string | null;
  fromEmail: string | null;
  allowHeaderSpoofing: boolean;
  verifyTlsCert: boolean;
  rateLimitPerMinute: number;
  rateLimitPerHour: number;
  passwordConfigured: boolean;
  passwordSetAt: Date | null;
  encryptionVersion: string | null;
  updatedAt: Date;
}

type CachedTransport = {
  expiresAt: number;
  signature: string;
  transport: Transporter;
  settings: MaterializedSmtpSettings;
};

let cachedTransport: CachedTransport | undefined;

function parseBooleanEnv(value: string | undefined, defaultValue = false): boolean {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off", ""].includes(normalized)) return false;
  return defaultValue;
}

function readTlsSettingValue(value: unknown): boolean | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.verifyTlsCert === "boolean") return record.verifyTlsCert;
  if (typeof record.enabled === "boolean") return record.enabled;
  return null;
}

async function getSmtpTlsVerificationSetting(): Promise<boolean> {
  const [row] = await db
    .select()
    .from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, SMTP_TLS_SETTINGS_KEY));

  const stored = readTlsSettingValue(row?.value);
  if (stored !== null) return stored;

  return parseBooleanEnv(process.env.SMTP_VERIFY_TLS, false);
}

async function setSmtpTlsVerificationSetting(verifyTlsCert: boolean): Promise<void> {
  const now = new Date();
  await db
    .insert(systemSettingsTable)
    .values({
      key: SMTP_TLS_SETTINGS_KEY,
      value: { verifyTlsCert },
      createdAt: now,
      updatedAt: now
    } as any)
    .onConflictDoUpdate({
      target: systemSettingsTable.key,
      set: {
        value: { verifyTlsCert } as any,
        updatedAt: now
      }
    });
}

function getDefaultPort(security: SecurityOption): number {
  if (security === "ssl_tls") return 465;
  return 25;
}

function sanitizeHostname(hostname?: string | null): string | null {
  if (!hostname) return null;
  const trimmed = hostname.trim();
  return trimmed || null;
}

function sanitizeOptional(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed || null;
}

async function ensureRow(): Promise<SmtpSettings> {
  const existing = await db.query.smtpSettings.findFirst({ where: eq(smtpSettingsTable.id, SETTINGS_ID) });
  if (existing) return existing;

  const [created] = await db.insert(smtpSettingsTable).values({ id: SETTINGS_ID }).returning();
  return created;
}

export async function getSmtpSettings(): Promise<PublicSmtpSettings> {
  const row = await ensureRow();
  const verifyTlsCert = await getSmtpTlsVerificationSetting();
  console.info("[smtp] settings read", { id: SETTINGS_ID, updatedAt: row.updatedAt?.toISOString?.() ?? null });

  return {
    enabled: row.enabled ?? false,
    hostname: row.hostname ?? null,
    port: row.port ?? null,
    security: (row.security ?? "none") as SecurityOption,
    authType: (row.authType ?? "none") as AuthOption,
    username: row.username ?? null,
    fromName: row.fromName ?? null,
    fromEmail: row.fromEmail ?? null,
    allowHeaderSpoofing: row.allowHeaderSpoofing ?? false,
    verifyTlsCert,
    rateLimitPerMinute: row.rateLimitPerMinute ?? 30,
    rateLimitPerHour: row.rateLimitPerHour ?? 500,
    passwordConfigured: Boolean(row.encryptedPassword),
    passwordSetAt: row.passwordSetAt ? row.passwordSetAt.toISOString() : null,
    encryptionVersion: row.encryptionVersion ?? null,
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : new Date().toISOString(),
  };
}

function validateHostname(hostname: string | null, enabled: boolean) {
  if (!enabled) return;
  if (!hostname) {
    throw new Error("Hostname is required when SMTP is enabled");
  }
  if (!hostRegex.test(hostname)) {
    throw new Error("Hostname must be a valid domain or IPv4 address");
  }
}

function validateFromEmail(email: string | null, enabled: boolean) {
  if (!enabled) return;
  if (!email) {
    throw new Error("From email is required when SMTP is enabled");
  }
  if (!z.string().email().safeParse(email).success) {
    throw new Error("From email must be valid");
  }
}

function normalizePort(port: number | null | undefined, security: SecurityOption): number {
  if (port && port > 0 && port <= 65535) {
    return port;
  }
  return getDefaultPort(security);
}

async function decryptPassword(payload: SmtpEncryptedSecretPayload | null, authType: AuthOption): Promise<string | undefined> {
  if (!payload || authType === "none") return undefined;
  return decryptEnvelopeSecret(payload);
}

function calculateSignature(settings: MaterializedSmtpSettings): string {
  const base = JSON.stringify({
    enabled: settings.enabled,
    hostname: settings.hostname,
    port: settings.port,
    security: settings.security,
    authType: settings.authType,
    username: settings.username,
    allowHeaderSpoofing: settings.allowHeaderSpoofing,
    verifyTlsCert: settings.verifyTlsCert,
    passwordSetAt: settings.passwordSetAt?.toISOString() ?? null,
    encryptionVersion: settings.encryptionVersion ?? null,
    updatedAt: settings.updatedAt.toISOString()
  });
  return Buffer.from(base).toString("base64");
}

async function materializeSettings(row: SmtpSettings): Promise<MaterializedSmtpSettings> {
  const security = (row.security ?? "none") as SecurityOption;
  const authType = (row.authType ?? "none") as AuthOption;
  const password = await decryptPassword(row.encryptedPassword as SmtpEncryptedSecretPayload | null, authType);
  const verifyTlsCert = await getSmtpTlsVerificationSetting();

  return {
    enabled: row.enabled ?? false,
    hostname: row.hostname ?? null,
    port: row.port ?? null,
    security,
    authType,
    username: row.username ?? null,
    password,
    fromName: row.fromName ?? null,
    fromEmail: row.fromEmail ?? null,
    allowHeaderSpoofing: row.allowHeaderSpoofing ?? false,
    verifyTlsCert,
    rateLimitPerMinute: row.rateLimitPerMinute ?? 30,
    rateLimitPerHour: row.rateLimitPerHour ?? 500,
    passwordConfigured: Boolean(row.encryptedPassword),
    passwordSetAt: row.passwordSetAt ?? null,
    encryptionVersion: row.encryptionVersion ?? null,
    updatedAt: row.updatedAt ?? new Date(),
  };
}

export function buildTransportOptions(settings: MaterializedSmtpSettings): SMTPTransport.Options {
  if (!settings.enabled) {
    throw new Error("SMTP is disabled");
  }

  const host = sanitizeHostname(settings.hostname);
  validateHostname(host, settings.enabled);
  validateFromEmail(settings.fromEmail, settings.enabled);

  const port = normalizePort(settings.port, settings.security);
  const secure = settings.security === "ssl_tls";
  const requireTLS = settings.security === "starttls";

let auth: SmtpAuth | undefined;
  let authMethod: string | undefined;

  if (settings.authType !== "none") {
    if (!settings.username) {
      throw new Error("Username is required when authentication is enabled");
    }
    if (!settings.password) {
      throw new Error("Password is required when authentication is enabled");
    }

    switch (settings.authType) {
      case "plain":
        authMethod = "PLAIN";
        auth = {
          user: settings.username,
          pass: settings.password,
        } as SmtpAuth;
        break;
      case "login":
        authMethod = "LOGIN";
        auth = {
          user: settings.username,
          pass: settings.password,
        } as SmtpAuth;
        break;
      case "cram_md5":
        authMethod = "CRAM-MD5";
        auth = {
          user: settings.username,
          pass: settings.password,
        };
        break;
      case "xoauth2":
        auth = {
          type: "OAuth2",
          user: settings.username!,
          accessToken: settings.password!,
        } as SmtpAuth;
        break;
      default:
        auth = {
          user: settings.username,
          pass: settings.password
        } as SmtpAuth;
        break;
    }
  }

  const transportOptions: SMTPTransport.Options = {
    host: host ?? undefined,
    port,
    secure,
    requireTLS,
    auth,
    // When security is "none", skip opportunistic TLS entirely (server may
    // advertise STARTTLS with a self-signed cert, which would fail).
    // For explicit TLS modes, certificate validation is controlled by settings.
    ...(settings.security === "none"
      ? { ignoreTLS: true }
      : { tls: { rejectUnauthorized: settings.verifyTlsCert } }),
  };

  if (authMethod) {
    (transportOptions as any).authMethod = authMethod;
  }

  return transportOptions;
}

export async function getOrCreateTransport(): Promise<{ transport: Transporter; settings: MaterializedSmtpSettings }> {
  const row = await ensureRow();
  const materialized = await materializeSettings(row);
  const signature = calculateSignature(materialized);
  const now = Date.now();

  if (cachedTransport && cachedTransport.signature === signature && cachedTransport.expiresAt > now) {
    return { transport: cachedTransport.transport, settings: cachedTransport.settings };
  }

  if (cachedTransport) {
    try {
      cachedTransport.transport.close();
    } catch {
      // ignore errors closing old transport
    }
  }

  const transportOptions = buildTransportOptions(materialized);
  const transport = nodemailer.createTransport(transportOptions);

  cachedTransport = {
    expiresAt: now + CACHE_TTL_MS,
    signature,
    transport,
    settings: materialized
  };

  return { transport, settings: materialized };
}

export function invalidateTransportCache() {
  if (cachedTransport) {
    try {
      cachedTransport.transport.close();
    } catch {
      // ignore
    }
    cachedTransport = undefined;
  }
}

export interface UpdateSmtpSettingsResult {
  settings: PublicSmtpSettings;
  passwordChanged: boolean;
}

export async function updateSmtpSettings(payload: UpdateInput, actorId: string, requestId?: string): Promise<UpdateSmtpSettingsResult> {
  const row = await ensureRow();
  const parsed = updateSchema.safeParse(payload);

  if (!parsed.success) {
    const errors = parsed.error.flatten();
    throw new Error(errors.formErrors[0] ?? Object.values(errors.fieldErrors)[0]?.[0] ?? "Invalid SMTP settings");
  }

  const updates = parsed.data;

  const enabled = updates.enabled ?? row.enabled ?? false;
  const security = (updates.security ?? (row.security ?? "none")) as SecurityOption;
  const authType = (updates.authType ?? (row.authType ?? "none")) as AuthOption;
  const hostname = sanitizeHostname(updates.hostname ?? row.hostname);
  const fromEmail = sanitizeOptional(updates.fromEmail ?? row.fromEmail);
  const fromName = sanitizeOptional(updates.fromName ?? row.fromName);
  const port = updates.port ?? row.port ?? getDefaultPort(security);
  const username = authType === "none" ? null : sanitizeOptional(updates.username ?? row.username ?? null);
  const verifyTlsCert = updates.verifyTlsCert ?? await getSmtpTlsVerificationSetting();

  validateHostname(hostname, enabled);
  validateFromEmail(fromEmail, enabled);

  let encryptedPassword = row.encryptedPassword as SmtpEncryptedSecretPayload | null;
  let encryptionVersion = row.encryptionVersion ?? null;
  let passwordSetAt = row.passwordSetAt ?? null;
  let passwordChanged = false;

  if (authType === "none") {
    encryptedPassword = null;
    encryptionVersion = null;
    passwordSetAt = null;
  } else if (updates.replacePassword) {
    if (!updates.newPassword) {
      throw new Error("New password is required when replacing password");
    }
    const encrypted = encryptEnvelopeSecret(updates.newPassword);
    encryptedPassword = encrypted.payload;
    encryptionVersion = encrypted.version;
    passwordSetAt = encrypted.passwordSetAt;
    passwordChanged = true;
  } else if (!encryptedPassword) {
    throw new Error("Password must be configured for authentication");
  }

  const updated = await db.update(smtpSettingsTable)
    .set({
      enabled,
      hostname,
      port,
      security,
      authType,
      username,
      encryptedPassword: encryptedPassword ? encryptedPassword : null,
      encryptionVersion,
      passwordSetAt,
      fromName,
      fromEmail,
      allowHeaderSpoofing: updates.allowHeaderSpoofing ?? row.allowHeaderSpoofing ?? false,
      rateLimitPerMinute: updates.rateLimitPerMinute ?? row.rateLimitPerMinute ?? 30,
      rateLimitPerHour: updates.rateLimitPerHour ?? row.rateLimitPerHour ?? 500,
      updatedAt: new Date(),
    })
    .where(eq(smtpSettingsTable.id, SETTINGS_ID))
    .returning()
    .then((rows) => rows[0]);

  await setSmtpTlsVerificationSetting(verifyTlsCert);

  invalidateTransportCache();

  logger.info('[smtp] settings updated', {
    actorId,
    enabled,
    security,
    authType,
    hostname,
    username,
    passwordChanged,
    verifyTlsCert,
  });

  await writeAuditLog({
    actorId,
    resourceType: "settings",
    resourceId: "smtp",
    action: "update",
    eventType: "smtp_settings_updated",
    requestId,
    details: {
      enabled,
      security,
      authType,
      hostname,
      port,
      username: username ? true : false, // avoid leaking username in audit
      passwordChanged,
      verifyTlsCert,
      allowHeaderSpoofing: updates.allowHeaderSpoofing ?? row.allowHeaderSpoofing ?? false
    }
  });

  if (updated.enabled ?? false) {
    try {
      const { transport } = await getOrCreateTransport();
      await transport.verify();
    } catch (error: any) {
      invalidateTransportCache();
      throw new Error(error?.message ?? "Failed to initialize SMTP transport with new settings");
    }
  }

  return {
    settings: {
      enabled: updated.enabled ?? false,
      hostname: updated.hostname ?? null,
      port: updated.port ?? null,
      security: (updated.security ?? "none") as SecurityOption,
      authType: (updated.authType ?? "none") as AuthOption,
      username: updated.username ?? null,
      fromName: updated.fromName ?? null,
      fromEmail: updated.fromEmail ?? null,
      allowHeaderSpoofing: updated.allowHeaderSpoofing ?? false,
      verifyTlsCert,
      rateLimitPerMinute: updated.rateLimitPerMinute ?? 30,
      rateLimitPerHour: updated.rateLimitPerHour ?? 500,
      passwordConfigured: Boolean(updated.encryptedPassword),
      passwordSetAt: updated.passwordSetAt ? updated.passwordSetAt.toISOString() : null,
      encryptionVersion: updated.encryptionVersion ?? null,
      updatedAt: updated.updatedAt ? updated.updatedAt.toISOString() : new Date().toISOString(),
    },
    passwordChanged,
  };
}

export type TestEmailResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

export function mapNodemailerError(error: any): { code: string; message: string } {
  if (!error || typeof error !== "object") {
    return { code: "unknown", message: "Unknown SMTP error" };
  }

  const code = error.code ?? error.responseCode;
  const message = error.message ?? "SMTP error";

  if (code === "EDNS") {
    return { code: "dns_failure", message: "DNS lookup failed for SMTP host" };
  }

  if (code === "ECONNECTION" || code === "ETIMEDOUT") {
    return { code: "connect_timeout", message: "Unable to connect to SMTP server" };
  }

  if (code === "EAUTH") {
    return { code: "auth_failure", message: "SMTP authentication failed" };
  }

  if (code === "ESOCKET" && message.toLowerCase().includes("tls")) {
    return { code: "tls_error", message: "TLS handshake failed" };
  }

  if (code === "EHLOSTARTTLS" || message.includes("STARTTLS")) {
    return { code: "starttls_unavailable", message: "Server did not advertise STARTTLS" };
  }

  return { code: "smtp_error", message };
}

export async function sendTestEmail(
  recipientEmail: string,
  recipientName: string | null | undefined,
  customSubject?: string,
  customHtml?: string
): Promise<TestEmailResult> {
  try {
    const { transport, settings } = await getOrCreateTransport();
    const displayName = settings.fromName ?? "OnBoardPro";

    await transport.verify();

    await transport.sendMail({
      from: settings.fromEmail ? `${displayName} <${settings.fromEmail}>` : settings.username ?? settings.fromEmail ?? undefined,
      to: recipientName ? `"${recipientName}" <${recipientEmail}>` : recipientEmail,
      subject: customSubject ?? "[OnBoardPro] SMTP Test Email",
      text: customHtml ? customHtml.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : "SMTP configuration is working correctly.",
      html: customHtml ?? `<p>SMTP configuration is working correctly.</p>`,
    });

    return { ok: true };
  } catch (error: any) {
    const mapped = mapNodemailerError(error);
    console.error("[smtp] test email failed", {
      code: mapped.code,
      message: mapped.message,
      raw: error?.code ?? null,
    });
    return { ok: false, ...mapped };
  }
}
