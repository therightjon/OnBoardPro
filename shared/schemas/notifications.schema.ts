import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  jsonb,
  pgEnum,
  index,
  uniqueIndex
} from "drizzle-orm/pg-core";
import { users } from "./auth.schema";

// Notification-related enums
export const notificationEntityEnum = pgEnum("notification_entity", [
  "candidate",
  "task",
  "comment"
]);

// Notifications table
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  entityType: notificationEntityEnum("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  payload: jsonb("payload").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deliveredChannels: text("delivered_channels").array().notNull().default(sql`'{}'::text[]`)
}, (t) => ({
  userReadCreatedIdx: index("notifications_user_read_created_idx").on(t.userId, t.isRead, t.createdAt)
}));

// Notification keys table
export const notificationKeys = pgTable("notification_keys", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (t) => ({
  keyUserUnique: uniqueIndex("notification_keys_key_user_idx").on(t.key, t.userId)
}));

// Type exports
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;
export type NotificationKey = typeof notificationKeys.$inferSelect;
export type InsertNotificationKey = typeof notificationKeys.$inferInsert;
