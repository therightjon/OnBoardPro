import { sql } from "drizzle-orm";
import { 
  pgTable, 
  uuid, 
  text, 
  timestamp, 
  boolean,
  integer,
  date,
  uniqueIndex
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { users } from "./auth.schema";
import { candidateTypes, hiringStages } from "./candidate.schema";
import { taskDefinitions, taskCategories, taskPriorities, dueRuleTypeEnum, taskAssigneeKindEnum } from "./task.schema";

// Template tables
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

export const templateTasks = pgTable("template_tasks", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: uuid("template_id").notNull(),
  taskDefId: uuid("task_def_id").notNull(),
  stageId: uuid("stage_id").notNull(),
  dueRuleType: dueRuleTypeEnum("due_rule_type").notNull(),
  dueRuleValue: integer("due_rule_value"),
  fixedDate: date("fixed_date"),
  defaultAssigneeKind: taskAssigneeKindEnum("default_assignee_kind").notNull().default("user"),
  defaultAssigneeUserId: uuid("default_assignee_user_id"),
  defaultAssigneeRole: text("default_assignee_role"),
  defaultPriorityId: uuid("default_priority_id"),
  defaultCategoryId: uuid("default_category_id"),
  isRequired: boolean("is_required").notNull().default(true),
  archived: boolean("archived").default(false).notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull()
});

// Relations
export const templatesRelations = relations(templates, ({ one, many }) => ({
  candidateType: one(candidateTypes, {
    fields: [templates.candidateTypeId],
    references: [candidateTypes.id]
  }),
  createdBy: one(users, {
    fields: [templates.createdBy],
    references: [users.id]
  }),
  stages: many(templateStages),
  tasks: many(templateTasks)
}));

export const templateStagesRelations = relations(templateStages, ({ one, many }) => ({
  template: one(templates, {
    fields: [templateStages.templateId],
    references: [templates.id]
  }),
  stage: one(hiringStages, {
    fields: [templateStages.stageId],
    references: [hiringStages.id]
  }),
  tasks: many(templateTasks)
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
  defaultAssignee: one(users, {
    fields: [templateTasks.defaultAssigneeUserId],
    references: [users.id]
  }),
  defaultCategory: one(taskCategories, {
    fields: [templateTasks.defaultCategoryId],
    references: [taskCategories.id]
  }),
  defaultPriority: one(taskPriorities, {
    fields: [templateTasks.defaultPriorityId],
    references: [taskPriorities.id]
  }),
  createdBy: one(users, {
    fields: [templateTasks.createdBy],
    references: [users.id]
  })
}));

// Zod schemas
export const insertTemplateSchema = createInsertSchema(templates);
export const insertTemplateStageSchema = createInsertSchema(templateStages);

// Types
export type Template = typeof templates.$inferSelect;
export type NewTemplate = typeof templates.$inferInsert;
export type InsertTemplate = typeof templates.$inferInsert; // Legacy compatibility
export type TemplateStage = typeof templateStages.$inferSelect;
export type NewTemplateStage = typeof templateStages.$inferInsert;
export type InsertTemplateStage = typeof templateStages.$inferInsert; // Legacy compatibility
export type TemplateTask = typeof templateTasks.$inferSelect;
export type NewTemplateTask = typeof templateTasks.$inferInsert;
export type InsertTemplateTask = typeof templateTasks.$inferInsert; // Legacy compatibility
