import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  boolean,
  jsonb,
  pgEnum,
  index,
  uniqueIndex
} from "drizzle-orm/pg-core";
import { users } from "./auth.schema";
import { notifications } from "./notifications.schema";

// SMTP-related enums
export const smtpSecurityEnum = pgEnum("smtp_security", [
  "none",
  "starttls",
  "ssl_tls"
]);

export const smtpAuthTypeEnum = pgEnum("smtp_auth_type", [
  "none",
  "plain",
  "login",
  "cram_md5",
  "xoauth2"
]);

// SMTP-related constants and types
export const SMTP_OUTBOX_STATUSES = ["pending", "retrying", "failed", "sent", "digest_pending"] as const;
export type SmtpOutboxStatus = typeof SMTP_OUTBOX_STATUSES[number];

export type SmtpEncryptedSecretPayload = {
  wrappedKey: string;
  wrappedKeyIv: string;
  wrappedKeyTag: string;
  ciphertext: string;
  iv: string;
  tag: string;
};

// SMTP settings table
export const smtpSettings = pgTable("smtp_settings", {
  id: text("id").primaryKey().default("primary"),
  enabled: boolean("enabled").notNull().default(false),
  hostname: text("hostname"),
  port: integer("port"),
  security: smtpSecurityEnum("security").notNull().default("none"),
  authType: smtpAuthTypeEnum("auth_type").notNull().default("none"),
  username: text("username"),
  encryptedPassword: jsonb("encrypted_password").$type<SmtpEncryptedSecretPayload | null>(),
  encryptionVersion: text("encryption_version"),
  passwordSetAt: timestamp("password_set_at", { withTimezone: true }),
  fromName: text("from_name"),
  fromEmail: text("from_email"),
  allowHeaderSpoofing: boolean("allow_header_spoofing").notNull().default(false),
  rateLimitPerMinute: integer("rate_limit_per_minute").notNull().default(30),
  rateLimitPerHour: integer("rate_limit_per_hour").notNull().default(500),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

// Notification outbox table (email delivery queue)
export const notificationOutbox = pgTable("notification_outbox", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  notificationId: uuid("notification_id").notNull().references(() => notifications.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  retryCount: integer("retry_count").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  digestCandidate: boolean("digest_candidate").notNull().default(false),
  lastError: text("last_error"),
  deliveredAt: timestamp("delivered_at", { withTimezone: true })
}, (t) => ({
  statusNextAttemptIdx: index("notification_outbox_status_next_attempt_idx").on(t.status, t.nextAttemptAt),
  notificationUniqueIdx: uniqueIndex("notification_outbox_notification_unique").on(t.notificationId)
}));

// Type exports
export type SmtpSettings = typeof smtpSettings.$inferSelect;
export type InsertSmtpSettings = typeof smtpSettings.$inferInsert;
export type NotificationOutboxEntry = typeof notificationOutbox.$inferSelect;
export type InsertNotificationOutboxEntry = typeof notificationOutbox.$inferInsert;
