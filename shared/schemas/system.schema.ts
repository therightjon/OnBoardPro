import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export const systemSettings = pgTable("system_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Convenience types
export type SystemSetting = typeof systemSettings.$inferSelect;
export type NewSystemSetting = typeof systemSettings.$inferInsert;

// Helper type and util for boolean toggle-like settings stored as JSON
export type ToggleSetting = { enabled: boolean };

export function readToggleEnabled(rows: SystemSetting[], key: string, defaultValue = false): boolean {
  const row = rows.find((r) => r.key === key);
  const v = row?.value as unknown;
  if (v && typeof v === 'object' && 'enabled' in (v as Record<string, unknown>)) {
    const enabled = (v as Record<string, unknown>).enabled;
    return Boolean(enabled);
  }
  return defaultValue;
}
