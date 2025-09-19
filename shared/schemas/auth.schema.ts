import { sql } from "drizzle-orm";
import { 
  pgTable, 
  uuid, 
  text, 
  timestamp, 
  boolean,
  time,
  jsonb,
  pgEnum,
  uniqueIndex,
  check,
  customType
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { departments, divisions } from "./candidate.schema";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Auth-related enums
export const roleEnum = pgEnum("role", [
  "system_admin", 
  "hr_staff", 
  "department_admin", 
  "division_leader", 
  "manager", 
  "candidate"
]);

export const userStatusEnum = pgEnum("user_status", [
  "active",
  "invited", 
  "disabled"
]);

export const appRoleEnum = pgEnum("app_role", [
  "system_admin",
  "hr_staff", 
  "department_admin",
  "division_leader",
  "manager",
  "candidate"
]);

// Auth tables
export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  mentionKey: text("mention_key").notNull(),
  passwordHash: text("password_hash"), // Nullable for external providers
  role: roleEnum("role").notNull(),
  status: userStatusEnum("status").default("active").notNull(),
  departmentId: uuid("department_id"),
  divisionId: uuid("division_id"),
  active: boolean("active").default(true).notNull(), // Keep for backward compatibility
  lastLoginAt: timestamp("last_login_at"),
  // Multi-provider authentication fields
  authProvider: text("auth_provider").notNull().default("local"),
  externalId: text("external_id"),
  username: text("username"),
  emailVerified: boolean("email_verified").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (t) => ({
  externalIdIndex: uniqueIndex("users_external_id_idx").on(t.externalId),
  usernameUniqueIndex: uniqueIndex("users_username_unique").on(sql`lower(${t.username})`),
  mentionKeyUniqueIndex: uniqueIndex("users_mention_key_unique").on(t.mentionKey)
}));

export const userIdentities = pgTable("user_identities", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), // 'local','ldap','oidc','google','azuread', etc.
  externalId: text("external_id").notNull(), // provider unique id (DN, sub, subject)
  email: text("email"), // email seen at the provider
  username: text("username"), // username seen at the provider
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (t) => ({
  uniqueProviderIdentity: uniqueIndex("user_identities_provider_external_id_unique").on(t.provider, t.externalId),
  userIdIndex: uniqueIndex("user_identities_user_id_idx").on(t.userId)
}));

export const userRoles = pgTable("user_roles", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: appRoleEnum("role").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (t) => ({
  uniqueUserRole: uniqueIndex("unique_user_role").on(t.userId, t.role)
}));

const citext = customType<{ data: string }>({
  dataType() {
    return "citext";
  }
});

export const invitations = pgTable("invitations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: citext("email").notNull(),
  username: citext("username").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  roles: text("roles").array().notNull(),
  token: text("token").notNull(),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  invitedBy: uuid("invited_by").references(() => users.id),
  departmentId: uuid("department_id").references(() => departments.id),
  divisionId: uuid("division_id").references(() => divisions.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
}, (t) => ({
  emailUnique: uniqueIndex("invitations_email_unique").on(sql`lower(${t.email})`),
  tokenUnique: uniqueIndex("invitations_token_unique").on(t.token),
  emailCheck: check("invitations_email_has_at", sql`${t.email} LIKE '%@%'`)
}));

export const authProviders = pgTable("auth_providers", {
  id: text("id").primaryKey(), // 'local', 'ldap', 'google', 'azuread'
  name: text("name").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const userPreferences = pgTable("user_preferences", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  mytasksShowArchived: boolean("mytasks_show_archived").notNull().default(false),
  mytasksShowCanceled: boolean("mytasks_show_canceled").notNull().default(false),
  mytasksShowCompleted: boolean("mytasks_show_completed").notNull().default(false),
  notifyInApp: boolean("notify_in_app").notNull().default(true),
  notifyEmail: boolean("notify_email").notNull().default(false),
  digestFrequency: text("digest_frequency").notNull().default("immediate"),
  quietHoursStart: time("quiet_hours_start"),
  quietHoursEnd: time("quiet_hours_end"),
  allowSelfNotifications: boolean("allow_self_notifications").notNull().default(false),
  eventSubscriptions: jsonb("event_subscriptions").$type<Record<string, boolean>>().notNull().default(sql`'{}'::jsonb`),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

// Auth relations
export const usersRelations = relations(users, ({ one, many }) => ({
  userRoles: many(userRoles),
  identities: many(userIdentities),
  preferences: one(userPreferences, {
    fields: [users.id],
    references: [userPreferences.userId]
  })
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(users, {
    fields: [userRoles.userId],
    references: [users.id]
  })
}));

export const userIdentitiesRelations = relations(userIdentities, ({ one }) => ({
  user: one(users, {
    fields: [userIdentities.userId],
    references: [users.id]
  })
}));

// Zod schemas for validation
export const insertUserSchema = createInsertSchema(users).extend({
  mentionKey: z.string().optional()
});
export const insertUserIdentitySchema = createInsertSchema(userIdentities);
export const insertUserRoleSchema = createInsertSchema(userRoles);
export const insertUserPreferencesSchema = createInsertSchema(userPreferences);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UserIdentity = typeof userIdentities.$inferSelect;
export type NewUserIdentity = typeof userIdentities.$inferInsert;
export type InsertUserIdentity = typeof userIdentities.$inferInsert; // Legacy compatibility
export type UserRole = typeof userRoles.$inferSelect;
export type NewUserRole = typeof userRoles.$inferInsert;
export type InsertUserRole = typeof userRoles.$inferInsert; // Legacy compatibility
export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
export type InsertInvitation = typeof invitations.$inferInsert;
export type UserPreferences = typeof userPreferences.$inferSelect;
export type NewUserPreferences = typeof userPreferences.$inferInsert;
export type InsertUserPreferences = typeof userPreferences.$inferInsert; // Legacy compatibility
export type AuthProvider = typeof authProviders.$inferSelect;
export type NewAuthProvider = typeof authProviders.$inferInsert;
export type InsertAuthProvider = typeof authProviders.$inferInsert; // Legacy compatibility
