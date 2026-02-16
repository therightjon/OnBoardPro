/**
 * Auth Provider Service
 *
 * Manages authentication providers (local, ldap, google, azuread) and LDAP settings
 */

import { eq } from "drizzle-orm";
import type { db as DbType } from "../../db/connection";
import { authProviders, systemSettings, type AuthProvider } from "@shared/schemas";
import { encryptSecret, decryptSecret } from "../../utils/secret";
import { writeAuditLog } from "../shared/audit-logger";
import { FIXED_LDAP_USER_FILTER_TEMPLATE } from "../../features/auth/identifier";

export interface LdapSettings {
  url?: string;
  startTls?: boolean;
  bindDn?: string;
  bindPassword?: string;
  baseDn?: string;
  userFilter?: string;
  usernameAttr?: string;
  firstNameAttr?: string;
  lastNameAttr?: string;
  emailAttr?: string;
  disabledFilter?: string;
}

function readEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key];
    if (value !== undefined && value !== "") {
      return value;
    }
  }
  return undefined;
}

export class AuthProviderService {
  constructor(private db: typeof DbType) {}

  // =====================================
  // Auth Providers
  // =====================================

  /**
   * Get all authentication providers
   */
  async getAllAuthProviders(): Promise<AuthProvider[]> {
    return await this.db
      .select()
      .from(authProviders)
      .orderBy(authProviders.id);
  }

  /**
   * Get a specific auth provider by ID
   */
  async getAuthProvider(id: string): Promise<AuthProvider | undefined> {
    const [provider] = await this.db
      .select()
      .from(authProviders)
      .where(eq(authProviders.id, id));
    return provider || undefined;
  }

  /**
   * Update an auth provider's settings
   */
  async updateAuthProvider(id: string, data: Partial<AuthProvider>, actorId?: string, requestId?: string): Promise<AuthProvider | undefined> {
    const [provider] = await this.db
      .update(authProviders)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(authProviders.id, id))
      .returning();
    if (provider) {
      await writeAuditLog({
        actorId,
        resourceType: "settings",
        resourceId: `auth_provider:${id}`,
        action: "update",
        eventType: "auth_provider_updated",
        requestId,
        details: { id, enabled: provider.enabled, name: provider.name }
      });
    }
    return provider || undefined;
  }

  // =====================================
  // LDAP Settings
  // =====================================

  /**
   * Get LDAP settings
   */
  async getLdapSettings(): Promise<LdapSettings> {
    const rows = await this.db.select().from(systemSettings);
    const map = new Map(rows.map((r: any) => [r.key, r.value]));
    const stored = (map.get('auth.ldap') ?? {}) as LdapSettings;

    // Fallback seed from env if nothing in DB
    const seeded: LdapSettings = Object.keys(stored).length === 0 ? {
      url: readEnv('LDAP_URL'),
      startTls: process.env.LDAP_STARTTLS === 'true',
      bindDn: readEnv('LDAP_BIND_DN'),
      bindPassword: process.env.LDAP_BIND_PASSWORD ? encryptSecret(process.env.LDAP_BIND_PASSWORD) : undefined,
      baseDn: readEnv('LDAP_BASE_DN', 'LDAP_SEARCH_BASE'),
      userFilter: FIXED_LDAP_USER_FILTER_TEMPLATE,
      usernameAttr: readEnv('LDAP_ATTR_USERNAME', 'LDAP_USERNAME_ATTR') || 'uid',
      firstNameAttr: readEnv('LDAP_ATTR_FIRST_NAME', 'LDAP_FIRSTNAME_ATTR') || 'givenName',
      lastNameAttr: readEnv('LDAP_ATTR_LAST_NAME', 'LDAP_LASTNAME_ATTR') || 'sn',
      emailAttr: readEnv('LDAP_ATTR_EMAIL', 'LDAP_EMAIL_ATTR') || 'mail',
      disabledFilter: readEnv('LDAP_DISABLED_FILTER'),
    } : stored;
    const normalized: LdapSettings = {
      ...seeded,
      userFilter: FIXED_LDAP_USER_FILTER_TEMPLATE,
    };

    // Decrypt for server-side use
    const decrypted = { ...normalized } as LdapSettings & { bindPassword?: string };
    if (decrypted.bindPassword) {
      const plain = decryptSecret(decrypted.bindPassword);
      if (plain) decrypted.bindPassword = plain;
    }
    return decrypted;
  }

  /**
   * Update LDAP settings
   */
  async setLdapSettings(partial: Partial<LdapSettings>, actorId?: string, requestId?: string): Promise<LdapSettings> {
    // Load existing to support partial updates and to avoid clearing password
    const existing = await this.getLdapSettings();
    const next: LdapSettings = {
      url: partial.url ?? existing.url,
      startTls: partial.startTls ?? existing.startTls,
      bindDn: partial.bindDn ?? existing.bindDn,
      bindPassword: existing.bindPassword, // temporary plain for now
      baseDn: partial.baseDn ?? existing.baseDn,
      userFilter: FIXED_LDAP_USER_FILTER_TEMPLATE,
      usernameAttr: partial.usernameAttr ?? existing.usernameAttr,
      firstNameAttr: partial.firstNameAttr ?? existing.firstNameAttr,
      lastNameAttr: partial.lastNameAttr ?? existing.lastNameAttr,
      emailAttr: partial.emailAttr ?? existing.emailAttr,
      disabledFilter: partial.disabledFilter ?? existing.disabledFilter,
    };

    // If an explicit bindPassword provided: set it
    if (partial.bindPassword !== undefined) {
      next.bindPassword = partial.bindPassword || existing.bindPassword;
    }

    // Prepare to store encrypted
    const toStore: LdapSettings = {
      ...next,
      userFilter: FIXED_LDAP_USER_FILTER_TEMPLATE,
    };
    if (toStore.bindPassword) {
      toStore.bindPassword = encryptSecret(toStore.bindPassword);
    }

    const now = new Date();
    await this.db
      .insert(systemSettings)
      .values({ key: 'auth.ldap', value: toStore as any, updatedAt: now, createdAt: now } as any)
      .onConflictDoUpdate({ target: systemSettings.key, set: { value: toStore as any, updatedAt: now } });

    await writeAuditLog({
      actorId,
      resourceType: "settings",
      resourceId: "auth.ldap",
      action: "update",
      eventType: "ldap_settings_updated",
      requestId,
      details: {
        url: toStore.url,
        startTls: toStore.startTls,
        baseDn: toStore.baseDn,
        userFilter: toStore.userFilter,
        usernameAttr: toStore.usernameAttr,
        emailAttr: toStore.emailAttr
      }
    });

    // Return decrypted/current
    return await this.getLdapSettings();
  }

  /**
   * Check if LDAP is fully configured
   */
  async getLdapConfigured(): Promise<boolean> {
    const cfg = await this.getLdapSettings();
    if (!cfg.url || !cfg.bindDn || !cfg.bindPassword || !cfg.baseDn) return false;
    if (!cfg.url.startsWith('ldaps://') && !cfg.startTls) return false;
    return true;
  }
}
