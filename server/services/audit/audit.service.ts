import { desc, and, lt, eq } from "drizzle-orm";
import { auditLog } from "@shared/schemas";
import { db as drizzleDb } from "../../db/connection";

export interface AuditQueryParams {
  resourceType?: string;
  action?: string;
  actorId?: string;
  limit?: number;
  before?: string; // ISO date cursor
}

export class AuditService {
  constructor(private db = drizzleDb) {}

  async list(params: AuditQueryParams) {
    const { resourceType, action, actorId, limit = 50, before } = params;
    const where = [];
    if (resourceType) where.push(eq(auditLog.resourceType, resourceType));
    if (action) where.push(eq(auditLog.action, action));
    if (actorId) where.push(eq(auditLog.actorId, actorId));
    if (before) {
      const beforeDate = new Date(before);
      if (!isNaN(beforeDate.getTime())) {
        where.push(lt(auditLog.occurredAt, beforeDate));
      }
    }

    const rows = await this.db
      .select()
      .from(auditLog)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(auditLog.occurredAt), desc(auditLog.id))
      .limit(Math.min(Math.max(limit, 1), 200));

    const nextCursor = rows.length > 0 ? rows[rows.length - 1].occurredAt?.toISOString?.() ?? null : null;

    return { items: rows, nextCursor };
  }
}
