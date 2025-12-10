import { sql } from "drizzle-orm";
import { pgTable, uuid, text, timestamp, jsonb } from "drizzle-orm/pg-core";

// Minimal audit log schema used for authorization and CRUD auditing
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  actorId: uuid("actor_id"),
  candidateId: uuid("candidate_id"),
  taskId: uuid("task_id"),
  resourceType: text("resource_type"),
  resourceId: text("resource_id"),
  action: text("action"),
  eventType: text("event_type").notNull(),
  details: jsonb("details")
});

export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;
