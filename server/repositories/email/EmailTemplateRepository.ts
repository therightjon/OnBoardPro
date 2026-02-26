/**
 * Email Template Repository
 *
 * Manages CRUD operations for email templates.
 * Each notification type has exactly one template row (seeded by migration).
 */

import { eq } from "drizzle-orm";
import {
  emailTemplates,
  type EmailTemplate,
  type EmailTemplateType
} from "@shared/schemas";
import { BaseRepository } from "../base/BaseRepository";
import type { db as DbType } from "../../db/connection";
import type { Pool } from "pg";

export class EmailTemplateRepository extends BaseRepository {
  constructor(db: typeof DbType, pool: Pool) {
    super(db, pool);
  }

  /**
   * Get all email templates
   */
  async getAll(): Promise<EmailTemplate[]> {
    return await this.db.select().from(emailTemplates);
  }

  /**
   * Get a single template by notification type
   */
  async getByType(notificationType: EmailTemplateType): Promise<EmailTemplate | undefined> {
    const results = await this.db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.notificationType, notificationType));
    return results[0];
  }

  /**
   * Update an existing template (subject, body, isActive)
   */
  async update(
    notificationType: EmailTemplateType,
    data: { subjectTemplate?: string; bodyTemplate?: string; isActive?: boolean; updatedBy?: string }
  ): Promise<EmailTemplate | undefined> {
    const results = await this.db
      .update(emailTemplates)
      .set({
        ...data,
        updatedAt: new Date()
      })
      .where(eq(emailTemplates.notificationType, notificationType))
      .returning();
    return results[0];
  }

  /**
   * Upsert a template (insert or update on conflict)
   */
  async upsert(
    notificationType: EmailTemplateType,
    data: { subjectTemplate: string; bodyTemplate: string; updatedBy?: string }
  ): Promise<EmailTemplate> {
    // Since we always have seeded rows, this is just an update
    const existing = await this.getByType(notificationType);
    if (existing) {
      const updated = await this.update(notificationType, data);
      return updated!;
    }
    // Fallback: insert if somehow missing
    const results = await this.db
      .insert(emailTemplates)
      .values({
        notificationType,
        ...data
      })
      .returning();
    return results[0];
  }
}
