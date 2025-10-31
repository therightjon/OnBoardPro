import { sql } from "drizzle-orm";
import { 
  pgTable, 
  uuid, 
  text, 
  varchar, 
  timestamp, 
  boolean, 
  integer,
  date,
  time,
  jsonb,
  pgEnum,
  uniqueIndex,
  primaryKey,
  index
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
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

export const candidateStatusEnum = pgEnum("candidate_status", [
  "draft", 
  "active", 
  "on_hold", 
  "completed", 
  "canceled",
  "archived"
]);

export const taskStatusEnum = pgEnum("task_status", [
  "todo", 
  "in_progress", 
  "blocked", 
  "done", 
  "canceled"
]);

export const priorityEnum = pgEnum("priority", [
  "low", 
  "medium", 
  "high", 
  "critical"
]);

export const taskAssigneeKindEnum = pgEnum("task_assignee_kind", [
  "user",
  "role"
]);

export const dueRuleTypeEnum = pgEnum("due_rule_type", [
  "on_loo_date",
  "days_before_loo",
  "days_after_loo",
  "days_before_start",
  "on_start_date",
  "days_after_start", 
  "days_before_stage",
  "days_after_stage",
  "fixed_date"
]);

export const salutationEnum = pgEnum("salutation_type", [
  "Mr.",
  "Ms.", 
  "Mrs.",
  "Dr.",
  "Prof.",
  "Mx.",
  "Other"
]);

export const notificationEntityEnum = pgEnum("notification_entity", [
  "candidate",
  "task",
  "comment"
]);

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

// Base tables
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

export const departments = pgTable("departments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  archived: boolean("archived").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const divisions = pgTable("divisions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  departmentId: uuid("department_id").notNull(),
  name: text("name").notNull(),
  archived: boolean("archived").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const candidateTypes = pgTable("candidate_types", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const facultyRanks = pgTable("faculty_ranks", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const taskCategories = pgTable("task_categories", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const taskPriorities = pgTable("task_priorities", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: priorityEnum("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const stagePhaseEnum = pgEnum("stage_phase", [
  "pre_hire",
  "onboarding"
]);

export const hiringStages = pgTable("hiring_stages", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  description: text("description"),
  orderIndex: integer("order_index").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const candidates = pgTable("candidates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  salutation: salutationEnum("salutation").notNull().default("Mr."),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  candidateTypeId: uuid("candidate_type_id").notNull(),
  departmentId: uuid("department_id").notNull(),
  divisionId: uuid("division_id"),
  managerId: uuid("manager_id"),
  facultyRankId: uuid("faculty_rank_id"),
  offerLetterIssuedAt: timestamp("offer_letter_issued_at"),
  offerLetterAcceptedAt: timestamp("offer_letter_accepted_at"),
  anticipatedStartDate: timestamp("anticipated_start_date"),
  status: candidateStatusEnum("status").default("active").notNull(),
  primaryOwnerId: uuid("primary_owner_id").references(() => users.id),
  linkedUserId: uuid("linked_user_id").references(() => users.id),
  currentStageId: uuid("current_stage_id").references(() => hiringStages.id),
  templateAppliedFromId: uuid("template_applied_from_id"),
  templateAppliedAt: timestamp("template_applied_at"),
  templateLocked: boolean("template_locked").default(false).notNull(),
  templateNameSnapshot: text("template_name_snapshot"), // Template name captured at expansion time
  templateVersion: integer("template_version").default(1), // Optional immutable version number
  archived: boolean("archived").default(false).notNull(),
  archivedAt: timestamp("archived_at"),
  archivedBy: uuid("archived_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const candidateStageHistory = pgTable("candidate_stage_history", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  candidateId: uuid("candidate_id").notNull(),
  fromStageId: uuid("from_stage_id"),
  toStageId: uuid("to_stage_id").notNull(),
  changedAt: timestamp("changed_at").defaultNow().notNull(),
  changedBy: uuid("changed_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const taskDefinitions = pgTable("task_definitions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  archived: boolean("archived").notNull().default(false),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (t) => ({
  nameUnique: uniqueIndex("task_definitions_name_unique").on(sql`lower(${t.name})`)
}));

export const templates = pgTable("templates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  candidateTypeId: uuid("candidate_type_id").notNull(),
  description: text("description"),
  isActive: boolean("is_active").default(true).notNull(),
  archived: boolean("archived").default(false).notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (t) => ({
  nameUnique: uniqueIndex("templates_name_unique").on(sql`lower(${t.name})`)
}));

export const templateStages = pgTable("template_stages", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: uuid("template_id").notNull().references(() => templates.id, { onDelete: "cascade" }),
  stageId: uuid("stage_id").notNull().references(() => hiringStages.id),
  orderIndex: integer("order_index").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  phase: stagePhaseEnum("phase").notNull().default("pre_hire"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const templateTasks = pgTable("template_tasks", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: uuid("template_id").notNull(),
  taskDefId: uuid("task_def_id").notNull(),
  stageId: uuid("stage_id").notNull(),
  templateStageId: uuid("template_stage_id").notNull().references(() => templateStages.id, { onDelete: "cascade" }),
  dueRuleType: dueRuleTypeEnum("due_rule_type").notNull(),
  dueRuleValue: integer("due_rule_value"),
  fixedDate: date("fixed_date"),
  defaultAssigneeKind: taskAssigneeKindEnum("default_assignee_kind").notNull().default("user"),
  defaultAssigneeUserId: uuid("default_assignee_user_id"),
  defaultAssigneeRole: text("default_assignee_role"),
  defaultPriorityId: uuid("default_priority_id"),
  defaultCategoryId: uuid("default_category_id"),
  archived: boolean("archived").default(false).notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const candidateTasks = pgTable("candidate_tasks", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  candidateId: uuid("candidate_id").notNull().references(() => candidates.id),
  taskDefId: uuid("task_def_id").references(() => taskDefinitions.id),
  title: text("title").notNull(),
  description: text("description"),
  stageId: uuid("stage_id").notNull().references(() => hiringStages.id),
  templateStageId: uuid("template_stage_id").references(() => templateStages.id, { onDelete: "set null" }),
  phaseSnapshot: stagePhaseEnum("phase_snapshot"),
  assigneeKind: taskAssigneeKindEnum("assignee_kind").notNull().default("user"),
  assigneeUserId: uuid("assignee_user_id").references(() => users.id),
  assigneeRole: text("assignee_role"),
  assigneeResolvedAt: timestamp("assignee_resolved_at"),
  priority: priorityEnum("priority").notNull(),
  categoryId: uuid("category_id").notNull().references(() => taskCategories.id),
  dueAt: timestamp("due_at"),
  dueRuleType: dueRuleTypeEnum("due_rule_type"),
  dueRuleValue: integer("due_rule_value"),
  fixedDate: date("fixed_date"),
  pendingAnchor: boolean("pending_anchor").notNull().default(false),
  status: taskStatusEnum("status").default("todo").notNull(),
  completedAt: timestamp("completed_at"),
  notes: text("notes"),
  required: boolean("required").default(true).notNull(),
  archived: boolean("archived").default(false).notNull(),
  stageOrderIndex: integer("stage_order_index"),
  deletedAt: timestamp("deleted_at"),
  dueSoonNotifiedAt: timestamp("due_soon_notified_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const candidateTemplateStages = pgTable("candidate_template_stages", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  candidateId: uuid("candidate_id").notNull().references(() => candidates.id, { onDelete: "cascade" }),
  stageId: uuid("stage_id").notNull().references(() => hiringStages.id),
  stageNameSnapshot: text("stage_name_snapshot").notNull(),
  orderIndex: integer("order_index").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
}, (t) => ({
  uniqueCandidateStage: uniqueIndex("uniq_candidate_stage").on(t.candidateId, t.stageId),
  candidateStageOrder: uniqueIndex("idx_candidate_stage_order").on(t.candidateId, t.orderIndex)
}));

export const candidateFollowers = pgTable("candidate_followers", {
  candidateId: uuid("candidate_id").notNull().references(() => candidates.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (t) => ({
  pk: primaryKey({ columns: [t.candidateId, t.userId], name: "candidate_followers_pkey" }),
  userIdx: index("candidate_followers_user_idx").on(t.userId)
}));

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

export const authProviders = pgTable("auth_providers", {
  id: text("id").primaryKey(), // 'local', 'ldap', 'google', 'azuread'
  name: text("name").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

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
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
});

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

export const notificationKeys = pgTable("notification_keys", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull()
}, (t) => ({
  keyUserUnique: uniqueIndex("notification_keys_key_user_idx").on(t.key, t.userId)
}));

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
  department: one(departments, {
    fields: [users.departmentId],
    references: [departments.id]
  }),
  division: one(divisions, {
    fields: [users.divisionId],
    references: [divisions.id]
  }),
  managedCandidates: many(candidates),
  ownedCandidates: many(candidates, { relationName: "candidateOwner" }),
  assignedTasks: many(candidateTasks),
  stageChanges: many(candidateStageHistory),
  notifications: many(notifications),
  notificationOutboxEntries: many(notificationOutbox),
  preferences: one(userPreferences, {
    fields: [users.id],
    references: [userPreferences.userId]
  }),
  userRoles: many(userRoles),
  identities: many(userIdentities),
  followingCandidates: many(candidateFollowers, { relationName: "userCandidateFollows" })
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

export const departmentsRelations = relations(departments, ({ many }) => ({
  divisions: many(divisions),
  users: many(users),
  candidates: many(candidates)
}));

export const divisionsRelations = relations(divisions, ({ one, many }) => ({
  department: one(departments, {
    fields: [divisions.departmentId],
    references: [departments.id]
  }),
  users: many(users),
  candidates: many(candidates)
}));

export const candidatesRelations = relations(candidates, ({ one, many }) => ({
  candidateType: one(candidateTypes, {
    fields: [candidates.candidateTypeId],
    references: [candidateTypes.id]
  }),
  department: one(departments, {
    fields: [candidates.departmentId],
    references: [departments.id]
  }),
  division: one(divisions, {
    fields: [candidates.divisionId],
    references: [divisions.id]
  }),
  manager: one(users, {
    fields: [candidates.managerId],
    references: [users.id]
  }),
  primaryOwner: one(users, {
    fields: [candidates.primaryOwnerId],
    references: [users.id],
    relationName: "candidateOwner"
  }),
  linkedUser: one(users, {
    fields: [candidates.linkedUserId],
    references: [users.id]
  }),
  template: one(templates, {
    fields: [candidates.templateAppliedFromId],
    references: [templates.id]
  }),
  tasks: many(candidateTasks),
  templateStages: many(candidateTemplateStages),
  stageHistory: many(candidateStageHistory),
  followers: many(candidateFollowers, { relationName: "candidateFollowers" })
}));

export const candidateTasksRelations = relations(candidateTasks, ({ one }) => ({
  candidate: one(candidates, {
    fields: [candidateTasks.candidateId],
    references: [candidates.id]
  }),
  taskDefinition: one(taskDefinitions, {
    fields: [candidateTasks.taskDefId],
    references: [taskDefinitions.id]
  }),
  stage: one(hiringStages, {
    fields: [candidateTasks.stageId],
    references: [hiringStages.id]
  }),
  templateStage: one(templateStages, {
    fields: [candidateTasks.templateStageId],
    references: [templateStages.id]
  }),
  assignee: one(users, {
    fields: [candidateTasks.assigneeUserId],
    references: [users.id]
  }),
  category: one(taskCategories, {
    fields: [candidateTasks.categoryId],
    references: [taskCategories.id]
  })
}));

export const candidateTemplateStagesRelations = relations(candidateTemplateStages, ({ one }) => ({
  candidate: one(candidates, {
    fields: [candidateTemplateStages.candidateId],
    references: [candidates.id]
  }),
  stage: one(hiringStages, {
    fields: [candidateTemplateStages.stageId],
    references: [hiringStages.id]
  })
}));

export const candidateFollowersRelations = relations(candidateFollowers, ({ one }) => ({
  candidate: one(candidates, {
    fields: [candidateFollowers.candidateId],
    references: [candidates.id],
    relationName: "candidateFollowers"
  }),
  user: one(users, {
    fields: [candidateFollowers.userId],
    references: [users.id],
    relationName: "userCandidateFollows"
  })
}));

export const notificationsRelations = relations(notifications, ({ one, many }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id]
  }),
  outboxEntries: many(notificationOutbox)
}));

export const notificationOutboxRelations = relations(notificationOutbox, ({ one }) => ({
  notification: one(notifications, {
    fields: [notificationOutbox.notificationId],
    references: [notifications.id]
  }),
  user: one(users, {
    fields: [notificationOutbox.userId],
    references: [users.id]
  })
}));

export const templatesRelations = relations(templates, ({ one, many }) => ({
  candidateType: one(candidateTypes, {
    fields: [templates.candidateTypeId],
    references: [candidateTypes.id]
  }),
  templateTasks: many(templateTasks),
  templateStages: many(templateStages),
  appliedCandidates: many(candidates)
}));

export const templateStagesRelations = relations(templateStages, ({ one }) => ({
  template: one(templates, {
    fields: [templateStages.templateId],
    references: [templates.id]
  }),
  stage: one(hiringStages, {
    fields: [templateStages.stageId],
    references: [hiringStages.id]
  })
}));

export const templateTasksRelations = relations(templateTasks, ({ one }) => ({
  template: one(templates, {
    fields: [templateTasks.templateId],
    references: [templates.id]
  }),
  taskDefinition: one(taskDefinitions, {
    fields: [templateTasks.taskDefId],
    references: [taskDefinitions.id]
  }),
  stage: one(hiringStages, {
    fields: [templateTasks.stageId],
    references: [hiringStages.id]
  }),
  templateStage: one(templateStages, {
    fields: [templateTasks.templateStageId],
    references: [templateStages.id]
  }),
  defaultAssignee: one(users, {
    fields: [templateTasks.defaultAssigneeUserId],
    references: [users.id]
  }),
  defaultPriority: one(taskPriorities, {
    fields: [templateTasks.defaultPriorityId],
    references: [taskPriorities.id]
  }),
  defaultCategory: one(taskCategories, {
    fields: [templateTasks.defaultCategoryId],
    references: [taskCategories.id]
  })
}));

export const candidateStageHistoryRelations = relations(candidateStageHistory, ({ one }) => ({
  candidate: one(candidates, {
    fields: [candidateStageHistory.candidateId],
    references: [candidates.id]
  }),
  fromStage: one(hiringStages, {
    fields: [candidateStageHistory.fromStageId],
    references: [hiringStages.id]
  }),
  toStage: one(hiringStages, {
    fields: [candidateStageHistory.toStageId],
    references: [hiringStages.id]
  }),
  changedByUser: one(users, {
    fields: [candidateStageHistory.changedBy],
    references: [users.id]
  })
}));

export const userPreferencesRelations = relations(userPreferences, ({ one }) => ({
  user: one(users, {
    fields: [userPreferences.userId],
    references: [users.id]
  })
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true
}).extend({
  // Make passwordHash optional since external providers don't need it
  passwordHash: z.string().optional(),
  mentionKey: z.string().optional()
});

export const insertUserRoleSchema = createInsertSchema(userRoles).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertUserIdentitySchema = createInsertSchema(userIdentities).omit({
  id: true,
  createdAt: true
});

export const insertCandidateSchema = createInsertSchema(candidates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  templateAppliedFromId: true,
  templateAppliedAt: true,
  templateLocked: true,
  linkedUserId: true
}).extend({
  offerLetterIssuedAt: z.coerce.date(),
  offerLetterAcceptedAt: z.union([z.coerce.date(), z.null()]).optional(),
  anticipatedStartDate: z.coerce.date()
});

export const insertCandidateTaskSchema = createInsertSchema(candidateTasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  assigneeResolvedAt: true,
  dueSoonNotifiedAt: true
});

export const insertTemplateSchema = createInsertSchema(templates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true
});

export const insertTemplateTaskSchema = createInsertSchema(templateTasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true
});

export const insertTemplateStageSchema = createInsertSchema(templateStages).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertCandidateTemplateStageSchema = createInsertSchema(candidateTemplateStages).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertTaskDefinitionSchema = createInsertSchema(taskDefinitions).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertDepartmentSchema = createInsertSchema(departments).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertDivisionSchema = createInsertSchema(divisions).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertHiringStageSchema = createInsertSchema(hiringStages).omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export const insertUserPreferencesSchema = createInsertSchema(userPreferences).omit({
  updatedAt: true
});

export const insertAuthProviderSchema = createInsertSchema(authProviders).omit({
  createdAt: true,
  updatedAt: true
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Candidate = typeof candidates.$inferSelect;
export type InsertCandidate = z.infer<typeof insertCandidateSchema>;
export type CandidateTask = typeof candidateTasks.$inferSelect;
export type InsertCandidateTask = z.infer<typeof insertCandidateTaskSchema>;
export type Template = typeof templates.$inferSelect;
export type InsertTemplate = z.infer<typeof insertTemplateSchema>;
export type TemplateTask = typeof templateTasks.$inferSelect;
export type InsertTemplateTask = z.infer<typeof insertTemplateTaskSchema>;
export type TemplateStage = typeof templateStages.$inferSelect;
export type InsertTemplateStage = z.infer<typeof insertTemplateStageSchema>;
export type CandidateTemplateStage = typeof candidateTemplateStages.$inferSelect;
export type InsertCandidateTemplateStage = z.infer<typeof insertCandidateTemplateStageSchema>;
export type CandidateFollower = typeof candidateFollowers.$inferSelect;
export type InsertCandidateFollower = typeof candidateFollowers.$inferInsert;
export type TaskDefinition = typeof taskDefinitions.$inferSelect;
export type InsertTaskDefinition = z.infer<typeof insertTaskDefinitionSchema>;
export type Department = typeof departments.$inferSelect;
export type InsertDepartment = z.infer<typeof insertDepartmentSchema>;
export type Division = typeof divisions.$inferSelect;
export type InsertDivision = z.infer<typeof insertDivisionSchema>;
export type HiringStage = typeof hiringStages.$inferSelect;
export type InsertHiringStage = z.infer<typeof insertHiringStageSchema>;
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;
export type NotificationOutboxEntry = typeof notificationOutbox.$inferSelect;
export type InsertNotificationOutboxEntry = typeof notificationOutbox.$inferInsert;
export type NotificationKey = typeof notificationKeys.$inferSelect;
export type InsertNotificationKey = typeof notificationKeys.$inferInsert;
export type SmtpSettings = typeof smtpSettings.$inferSelect;
export type InsertSmtpSettings = typeof smtpSettings.$inferInsert;
export type TaskCategory = typeof taskCategories.$inferSelect;
export type TaskPriority = typeof taskPriorities.$inferSelect;
export type CandidateType = typeof candidateTypes.$inferSelect;
export type FacultyRank = typeof facultyRanks.$inferSelect;
export type UserPreferences = typeof userPreferences.$inferSelect;
export type InsertUserPreferences = z.infer<typeof insertUserPreferencesSchema>;
export type UserRole = typeof userRoles.$inferSelect;
export type InsertUserRole = z.infer<typeof insertUserRoleSchema>;
export type UserIdentity = typeof userIdentities.$inferSelect;
export type InsertUserIdentity = z.infer<typeof insertUserIdentitySchema>;
export type AuthProvider = typeof authProviders.$inferSelect;
export type InsertAuthProvider = z.infer<typeof insertAuthProviderSchema>;

// Provider management types
export type ProviderInfo = {
  id: "local" | "ldap" | "google" | "azuread";
  name: string;
  enabled: boolean;            // from DB toggle
  configured: boolean;         // from env check
  effectiveEnabled: boolean;   // enabled && configured
  canEnable: boolean;          // same as configured
  clientIdMasked?: string;
  callbackUrl?: string;
  notes?: string;
};
