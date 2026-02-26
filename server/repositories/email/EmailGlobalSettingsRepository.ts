/**
 * Email Global Settings Repository
 *
 * Manages the single-row configuration for global email layout
 * (header/footer text, colors, page/card backgrounds).
 */

import { emailGlobalSettings, type EmailGlobalSettings } from "@shared/schemas";
import { BaseRepository } from "../base/BaseRepository";
import type { db as DbType } from "../../db/connection";
import type { Pool } from "pg";

export class EmailGlobalSettingsRepository extends BaseRepository {
  constructor(db: typeof DbType, pool: Pool) {
    super(db, pool);
  }

  /**
   * Get the single global settings row.
   * Returns undefined only if the seed row is somehow missing.
   */
  async get(): Promise<EmailGlobalSettings | undefined> {
    const results = await this.db.select().from(emailGlobalSettings).limit(1);
    return results[0];
  }

  /**
   * Update the single global settings row.
   * Accepts a partial set of fields — only provided fields are updated.
   */
  async update(
    data: Partial<Omit<EmailGlobalSettings, "id" | "updatedAt">>,
  ): Promise<EmailGlobalSettings> {
    const rows = await this.db.select().from(emailGlobalSettings).limit(1);
    const existing = rows[0];
    if (!existing) {
      // Seed row missing — insert with provided values
      const inserted = await this.db
        .insert(emailGlobalSettings)
        .values({ ...data, updatedAt: new Date() })
        .returning();
      return inserted[0];
    }

    const { eq } = await import("drizzle-orm");
    const updated = await this.db
      .update(emailGlobalSettings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(emailGlobalSettings.id, existing.id))
      .returning();
    return updated[0];
  }
}
