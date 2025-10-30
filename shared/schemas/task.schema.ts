import { sql } from "drizzle-orm";
import { 
  pgTable, 
  uuid, 
  text, 
  timestamp, 
  boolean,
  integer,
  date,
  pgEnum,
  uniqueIndex
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { users } from "./auth.schema";
import { candidates, hiringStages } from "./candidate.schema";

// Task-related enums
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

export const taskAssigneeKindEnum = pgEnum("task_assignee_kind", [
  "user",
  "role"
]);

// Task support tables
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

export const candidateTasks = pgTable("candidate_tasks", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  candidateId: uuid("candidate_id").notNull().references(() => candidates.id),
  taskDefId: uuid("task_def_id").references(() => taskDefinitions.id),
  title: text("title").notNull(),
  description: text("description"),
  stageId: uuid("stage_id").notNull().references(() => hiringStages.id),
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
  cancelReason: text("cancel_reason"),
  notes: text("notes"),
  required: boolean("required").default(true).notNull(),
  archived: boolean("archived").default(false).notNull(),
  stageOrderIndex: integer("stage_order_index"),
  updatedBy: uuid("updated_by").references(() => users.id),
  deletedAt: timestamp("deleted_at"),
  dueSoonNotifiedAt: timestamp("due_soon_notified_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

// Relations
export const taskDefinitionsRelations = relations(taskDefinitions, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [taskDefinitions.createdBy],
    references: [users.id]
  }),
  candidateTasks: many(candidateTasks)
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
  assignee: one(users, {
    fields: [candidateTasks.assigneeUserId],
    references: [users.id]
  }),
  category: one(taskCategories, {
    fields: [candidateTasks.categoryId],
    references: [taskCategories.id]
  })
}));

export const taskCategoriesRelations = relations(taskCategories, ({ many }) => ({
  candidateTasks: many(candidateTasks)
}));

// Zod schemas
export const insertTaskDefinitionSchema = createInsertSchema(taskDefinitions);
export const insertCandidateTaskSchema = createInsertSchema(candidateTasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  assigneeResolvedAt: true,
  dueSoonNotifiedAt: true
});

// Types
export type TaskDefinition = typeof taskDefinitions.$inferSelect;
export type NewTaskDefinition = typeof taskDefinitions.$inferInsert;
export type InsertTaskDefinition = typeof taskDefinitions.$inferInsert; // Legacy compatibility
export type CandidateTask = typeof candidateTasks.$inferSelect;
export type NewCandidateTask = typeof candidateTasks.$inferInsert;
export type InsertCandidateTask = typeof candidateTasks.$inferInsert; // Legacy compatibility
export type TaskCategory = typeof taskCategories.$inferSelect;
export type NewTaskCategory = typeof taskCategories.$inferInsert;
export type TaskPriority = typeof taskPriorities.$inferSelect;
export type NewTaskPriority = typeof taskPriorities.$inferInsert;
