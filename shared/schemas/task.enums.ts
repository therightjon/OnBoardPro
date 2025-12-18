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
  "on_loi_date",
  "days_before_loi",
  "days_after_loi",
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

export const prerequisiteConditionEnum = pgEnum("prerequisite_condition", [
  "requires_pt",
  "always"
]);
