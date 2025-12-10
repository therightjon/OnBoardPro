import { auditLog, type NewAuditLogEntry } from "@shared/schemas";
import { db } from "../../db/connection";

export type AuditResourceType =
  | "candidate"
  | "candidate_task"
  | "task"
  | "template"
  | "template_task"
  | "comment"
  | "user"
  | "department"
  | "division"
  | "invitation"
  | "settings"
  | "general";

export type AuditAction =
  | "create"
  | "update"
  | "delete"
  | "archive"
  | "restore"
  | "assign"
  | "status_change"
  | "access_denied";

export interface AuditLogParams {
  actorId?: string | null;
  resourceType: AuditResourceType;
  resourceId?: string | null;
  action: AuditAction;
  eventType?: string;
  details?: Record<string, any> | null;
  candidateId?: string | null;
  taskId?: string | null;
  requestId?: string | null;
}

export async function writeAuditLog(params: AuditLogParams): Promise<void> {
  try {
    const payload: NewAuditLogEntry = {
      actorId: params.actorId ?? null,
      candidateId: params.candidateId ?? null,
      taskId: params.taskId ?? null,
      resourceType: params.resourceType,
      resourceId: params.resourceId ?? null,
      action: params.action,
      eventType: params.eventType ?? "crud",
      details: params.details
        ? {
            ...params.details,
            ...(params.requestId ? { requestId: params.requestId } : {})
          }
        : params.requestId
          ? { requestId: params.requestId }
          : null
    };

    await db.insert(auditLog).values(payload).execute();
  } catch (error) {
    // Auditing should never block business logic
    console.error("Failed to write audit log", error);
  }
}
