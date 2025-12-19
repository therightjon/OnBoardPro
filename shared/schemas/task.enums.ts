import { pgEnum } from "drizzle-orm/pg-core";

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
  // LOI-based (prerequisite tasks only)
  "on_loi_date",
  "days_before_loi",
  "days_after_loi",

  // LOO-based - Generic (backward compatible - uses accepted → issued fallback)
  "on_loo_date",
  "days_before_loo",
  "days_after_loo",

  // LOO-based - Explicit Accepted
  "on_loo_accepted_date",
  "days_before_loo_accepted",
  "days_after_loo_accepted",

  // LOO-based - Explicit Issued
  "on_loo_issued_date",
  "days_before_loo_issued",
  "days_after_loo_issued",

  // Start date-based
  "days_before_start",
  "on_start_date",
  "days_after_start",

  // Stage-relative
  "days_before_stage",
  "days_after_stage",

  // Fixed
  "fixed_date"
]);

export const taskAssigneeKindEnum = pgEnum("task_assignee_kind", [
  "user",
  "role"
]);

export const prerequisiteConditionEnum = pgEnum("prerequisite_condition", [
  "requires_pt",
  "always"
]);
