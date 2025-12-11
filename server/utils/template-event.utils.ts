/**
 * Template Event Utilities
 * Purpose: Shared utilities for publishing template-related events
 * Belongs: Event publishing logic for template expansion and task creation
 * Conventions: Use eventBus for all event publishing, ensure consistent event payloads
 */
import { eventBus, taskCreated } from "../events";
import type { TemplateExpansionTask } from "../repositories/base/types";

/**
 * Publish taskCreated events for all tasks created from template expansion
 *
 * This utility is used by both POST /api/candidates (creation with LOO accepted)
 * and PATCH /api/candidates/:id (LOO acceptance) to ensure consistent event
 * publishing when templates are auto-applied.
 *
 * @param tasks - Array of tasks created from template expansion
 * @param actorId - Optional ID of the user who triggered the template expansion
 */
export async function publishTemplateTaskCreatedEvents(
  tasks: TemplateExpansionTask[],
  actorId?: string
): Promise<void> {
  await Promise.all(
    tasks.map((task) =>
      eventBus.publish(taskCreated(task.id, {
        candidateId: task.candidateId,
        title: task.title,
        assigneeUserId: task.assigneeUserId,
        assigneeRole: task.assigneeKind === 'role' ? task.assigneeRole : null,
        dueAt: task.dueAt,
        isRequired: false,
        fromTemplate: true
      }, {
        actorId
      }))
    )
  );
}
