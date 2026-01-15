/**
 * System Settings Service
 *
 * Manages system-wide settings like auto_regress_on_prior_open
 * and security settings like session timeouts
 */

import type { db as DbType } from "../../db/connection";
import { systemSettings } from "@shared/schemas";
import { writeAuditLog } from "../shared/audit-logger";
import { env } from "../../config/env";

export interface SystemSettings {
  auto_regress_on_prior_open: boolean;
}

export interface SecuritySettings {
  session_idle_timeout_hours: number;
  session_absolute_timeout_hours: number;
}

// In-memory cache for security settings (used by session-timeout middleware)
let securitySettingsCache: SecuritySettings | null = null;
let securitySettingsCacheExpiry = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute cache

/**
 * Get cached security settings for use in middleware.
 * Falls back to environment defaults if cache is empty.
 */
export function getCachedSecuritySettings(): SecuritySettings {
  if (securitySettingsCache && Date.now() < securitySettingsCacheExpiry) {
    return securitySettingsCache;
  }
  // Return defaults if cache is empty (will be populated on first DB read)
  return {
    session_idle_timeout_hours: env.SESSION_IDLE_TIMEOUT_HOURS,
    session_absolute_timeout_hours: env.SESSION_ABSOLUTE_TIMEOUT_HOURS,
  };
}

/**
 * Update the security settings cache (called after DB reads/writes)
 */
function updateSecuritySettingsCache(settings: SecuritySettings): void {
  securitySettingsCache = settings;
  securitySettingsCacheExpiry = Date.now() + CACHE_TTL_MS;
}

/**
 * Clear the security settings cache (for testing)
 */
export function clearSecuritySettingsCache(): void {
  securitySettingsCache = null;
  securitySettingsCacheExpiry = 0;
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
  async setSystemSettings(patch: Partial<SystemSettings>, actorId?: string, requestId?: string): Promise<SystemSettings | undefined> {
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

      await writeAuditLog({
        actorId,
        resourceType: "settings",
        resourceId: "system",
        action: "update",
        eventType: "system_settings_updated",
        requestId,
        details: { auto_regress_on_prior_open: !!patch.auto_regress_on_prior_open }
      });
    }
    return await this.getSystemSettings();
  }

  /**
   * Get current security settings (session timeouts)
   * Falls back to environment defaults if not set in DB
   */
  async getSecuritySettings(): Promise<SecuritySettings> {
    const rows = await this.db.select().from(systemSettings);
    const map = new Map(rows.map((r: any) => [r.key, r.value]));
    
    const idleTimeout = map.get('session_idle_timeout_hours')?.hours ?? env.SESSION_IDLE_TIMEOUT_HOURS;
    const absoluteTimeout = map.get('session_absolute_timeout_hours')?.hours ?? env.SESSION_ABSOLUTE_TIMEOUT_HOURS;
    
    const settings: SecuritySettings = {
      session_idle_timeout_hours: idleTimeout,
      session_absolute_timeout_hours: absoluteTimeout,
    };
    
    // Update cache whenever we read from DB
    updateSecuritySettingsCache(settings);
    
    return settings;
  }

  /**
   * Update security settings (session timeouts)
   * Only system_admin can call this (enforced at route level)
   */
  async setSecuritySettings(
    patch: Partial<SecuritySettings>,
    actorId?: string,
    requestId?: string
  ): Promise<SecuritySettings> {
    const now = new Date();
    
    if (patch.session_idle_timeout_hours !== undefined) {
      const value = { hours: patch.session_idle_timeout_hours };
      await this.db
        .insert(systemSettings)
        .values({ key: 'session_idle_timeout_hours', value, updatedAt: now, createdAt: now } as any)
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: { value, updatedAt: now }
        });
    }
    
    if (patch.session_absolute_timeout_hours !== undefined) {
      const value = { hours: patch.session_absolute_timeout_hours };
      await this.db
        .insert(systemSettings)
        .values({ key: 'session_absolute_timeout_hours', value, updatedAt: now, createdAt: now } as any)
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: { value, updatedAt: now }
        });
    }
    
    // Get updated settings and refresh cache
    const updated = await this.getSecuritySettings();
    
    await writeAuditLog({
      actorId,
      resourceType: "settings",
      resourceId: "security",
      action: "update",
      eventType: "security_settings_updated",
      requestId,
      details: patch
    });
    
    return updated;
  }
}
