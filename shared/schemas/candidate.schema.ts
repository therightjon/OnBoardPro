import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  pgEnum,
  uniqueIndex,
  jsonb,
  primaryKey,
  index,
  date
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { users } from "./auth.schema";

// Candidate-related enums
export const candidateStatusEnum = pgEnum("candidate_status", [
  "draft", 
  "active", 
  "on_hold", 
  "completed", 
  "canceled",
  "offer_declined",
  "archived"
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

// Candidate support tables
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

// Main candidate table
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
  // Hiring milestone dates
  letterOfIntentDate: date("letter_of_intent_date"), // Required at creation, immutable
  offerLetterIssuedAt: timestamp("offer_letter_issued_at"),
  offerLetterAcceptedAt: timestamp("offer_letter_accepted_at"),
  anticipatedStartDate: timestamp("anticipated_start_date"), // Optional at creation, required before onboarding
  status: candidateStatusEnum("status").default("active").notNull(),
  primaryOwnerId: uuid("primary_owner_id").references(() => users.id),
  linkedUserId: uuid("linked_user_id").references(() => users.id),
  currentStageId: uuid("current_stage_id").references(() => hiringStages.id),
  templateAppliedFromId: uuid("template_applied_from_id"),
  templateAppliedAt: timestamp("template_applied_at"),
  templateLocked: boolean("template_locked").default(false).notNull(),
  templateNameSnapshot: text("template_name_snapshot"), // Template name captured at expansion time
  templateVersion: integer("template_version").default(1), // Optional immutable version number
  statusBeforeArchive: candidateStatusEnum("status_before_archive"),
  archived: boolean("archived").default(false).notNull(),
  archivedAt: timestamp("archived_at"),
  archivedBy: uuid("archived_by").references(() => users.id),
  // New: prior-stage blocking fields
  isBlockedByPriorStage: boolean("is_blocked_by_prior_stage").notNull().default(false),
  blockerSummary: jsonb("blocker_summary"),
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

// Relations
export const departmentsRelations = relations(departments, ({ many }) => ({
  divisions: many(divisions),
  candidates: many(candidates)
}));

export const divisionsRelations = relations(divisions, ({ one, many }) => ({
  department: one(departments, {
    fields: [divisions.departmentId],
    references: [departments.id]
  }),
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
    references: [users.id]
  }),
  linkedUser: one(users, {
    fields: [candidates.linkedUserId],
    references: [users.id]
  }),
  facultyRank: one(facultyRanks, {
    fields: [candidates.facultyRankId],
    references: [facultyRanks.id]
  }),
  currentStage: one(hiringStages, {
    fields: [candidates.currentStageId],
    references: [hiringStages.id]
  }),
  stageHistory: many(candidateStageHistory),
  templateStages: many(candidateTemplateStages)
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
  changedBy: one(users, {
    fields: [candidateStageHistory.changedBy],
    references: [users.id]
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

export const candidateFollowers = pgTable("candidate_followers", {
  candidateId: uuid("candidate_id").notNull().references(() => candidates.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.candidateId, t.userId], name: "candidate_followers_pkey" }),
  userIdx: index("candidate_followers_user_idx").on(t.userId)
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

// Zod schemas
export const insertCandidateSchema = createInsertSchema(candidates).extend({
  // Letter of Intent date - required at creation, immutable
  letterOfIntentDate: z.coerce.date(),
  // LOO dates - optional at creation
  offerLetterIssuedAt: z.coerce.date().optional().nullable(),
  offerLetterAcceptedAt: z.coerce.date().optional().nullable(),
  // Anticipated start date - optional at creation, can be set when LOO is accepted
  anticipatedStartDate: z.coerce.date().optional().nullable(),
  // Template ID - required at creation but expansion is deferred until LOO accepted
  templateAppliedFromId: z.string().uuid().optional().nullable(),
});
export const insertDepartmentSchema = createInsertSchema(departments);
export const insertDivisionSchema = createInsertSchema(divisions);
export const insertHiringStageSchema = createInsertSchema(hiringStages);

// Types
export type Candidate = typeof candidates.$inferSelect;
export type NewCandidate = typeof candidates.$inferInsert;
export type InsertCandidate = typeof candidates.$inferInsert; // Legacy compatibility
export type CandidateFollower = typeof candidateFollowers.$inferSelect;
export type InsertCandidateFollower = typeof candidateFollowers.$inferInsert;
export type Department = typeof departments.$inferSelect;
export type NewDepartment = typeof departments.$inferInsert;
export type InsertDepartment = typeof departments.$inferInsert; // Legacy compatibility
export type Division = typeof divisions.$inferSelect;
export type NewDivision = typeof divisions.$inferInsert;
export type InsertDivision = typeof divisions.$inferInsert; // Legacy compatibility
export type CandidateType = typeof candidateTypes.$inferSelect;
export type NewCandidateType = typeof candidateTypes.$inferInsert;
export type FacultyRank = typeof facultyRanks.$inferSelect;
export type NewFacultyRank = typeof facultyRanks.$inferInsert;
export type HiringStage = typeof hiringStages.$inferSelect;
export type NewHiringStage = typeof hiringStages.$inferInsert;
export type InsertHiringStage = typeof hiringStages.$inferInsert; // Legacy compatibility
export type CandidateTemplateStage = typeof candidateTemplateStages.$inferSelect;
export type NewCandidateTemplateStage = typeof candidateTemplateStages.$inferInsert;
export type InsertCandidateTemplateStage = typeof candidateTemplateStages.$inferInsert; // Legacy compatibility
