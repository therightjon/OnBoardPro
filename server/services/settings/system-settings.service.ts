/**
 * System Settings Service
 *
 * Manages system-wide settings like auto_regress_on_prior_open
 */

import type { db as DbType } from "../../db/connection";
import { systemSettings } from "@shared/schemas";

export interface SystemSettings {
  auto_regress_on_prior_open: boolean;
}

export class SystemSettingsService {
  constructor(private db: typeof DbType) {}

  /**
   * Get current system settings
   */
  async getSystemSettings(): Promise<SystemSettings> {
    const rows = await this.db.select().from(systemSettings);
    const map = new Map(rows.map((r: any) => [r.key, r.value]));
    const autoRegress = Boolean(map.get('auto_regress_on_prior_open')?.enabled ?? false);
    return { auto_regress_on_prior_open: autoRegress };
  }

  /**
   * Update system settings
   */
  async setSystemSettings(patch: Partial<SystemSettings>): Promise<SystemSettings | undefined> {
    if (patch.auto_regress_on_prior_open !== undefined) {
      const now = new Date();
      const value = { enabled: !!patch.auto_regress_on_prior_open } as any;
      await this.db
        .insert(systemSettings)
        .values({ key: 'auto_regress_on_prior_open', value, updatedAt: now, createdAt: now } as any)
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: { value, updatedAt: now }
        });
    }
    return await this.getSystemSettings();
  }
}
