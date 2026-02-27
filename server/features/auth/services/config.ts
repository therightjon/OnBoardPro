// Authentication provider configuration

import { FIXED_LDAP_USER_FILTER_TEMPLATE } from "../identifier";

export interface AuthConfig {
  enabledProviders: string[];
  local: {
    enabled: boolean;
  };
  ldap: {
    enabled: boolean;
    url?: string;
    startTls?: boolean;
    verifyTlsCert?: boolean;
    bindDn?: string;
    bindPassword?: string;
    baseDn?: string;
    userFilter?: string;
    usernameAttr?: string;
    firstNameAttr?: string;
    lastNameAttr?: string;
    emailAttr?: string;
    disabledFilter?: string;
  };
  oidc: {
    enabled: boolean;
    issuer?: string;
    clientId?: string;
    clientSecret?: string;
  };
  google: {
    enabled: boolean;
    clientId?: string;
    clientSecret?: string;
  };
  azuread: {
    enabled: boolean;
    clientId?: string;
    clientSecret?: string;
    tenantId?: string;
  };
}

function readAuthEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key];
    if (value !== undefined && value !== "") {
      return value;
    }
  }
  return undefined;
}

function readAuthBooleanEnv(key: string, defaultValue = false): boolean {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off", ""].includes(normalized)) return false;
  return defaultValue;
}

// Load configuration from environment variables
export function loadAuthConfig(): AuthConfig {
  const config: AuthConfig = {
    enabledProviders: [],
    local: {
      enabled: process.env.AUTH_ENABLE_LOCAL !== "false", // Default enabled
    },
    ldap: {
      enabled: process.env.AUTH_ENABLE_LDAP === "true",
      url: process.env.LDAP_URL,
      startTls: process.env.LDAP_STARTTLS === "true",
      verifyTlsCert: readAuthBooleanEnv("LDAP_VERIFY_TLS", false),
      bindDn: process.env.LDAP_BIND_DN,
      bindPassword: process.env.LDAP_BIND_PASSWORD,
      baseDn: readAuthEnv("LDAP_BASE_DN", "LDAP_SEARCH_BASE"),
      userFilter: FIXED_LDAP_USER_FILTER_TEMPLATE,
      usernameAttr: readAuthEnv("LDAP_ATTR_USERNAME", "LDAP_USERNAME_ATTR") || "uid",
      firstNameAttr: readAuthEnv("LDAP_ATTR_FIRST_NAME", "LDAP_FIRSTNAME_ATTR") || "givenName",
      lastNameAttr: readAuthEnv("LDAP_ATTR_LAST_NAME", "LDAP_LASTNAME_ATTR") || "sn",
      emailAttr: readAuthEnv("LDAP_ATTR_EMAIL", "LDAP_EMAIL_ATTR") || "mail",
      disabledFilter: process.env.LDAP_DISABLED_FILTER,
    },
    oidc: {
      enabled: process.env.AUTH_ENABLE_OIDC === "true",
      issuer: process.env.OIDC_ISSUER,
      clientId: process.env.OIDC_CLIENT_ID,
      clientSecret: process.env.OIDC_CLIENT_SECRET,
    },
    google: {
      enabled: process.env.AUTH_ENABLE_GOOGLE === "true",
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
    azuread: {
      enabled: process.env.AUTH_ENABLE_AZUREAD === "true",
      clientId: process.env.AZUREAD_CLIENT_ID,
      clientSecret: process.env.AZUREAD_CLIENT_SECRET,
      tenantId: process.env.AZUREAD_TENANT_ID,
    },
  };

  // Build enabled providers list
  if (config.local.enabled) config.enabledProviders.push("local");
  if (config.ldap.enabled) config.enabledProviders.push("ldap");
  if (config.oidc.enabled) config.enabledProviders.push("oidc");
  if (config.google.enabled) config.enabledProviders.push("google");
  if (config.azuread.enabled) config.enabledProviders.push("azuread");

  return config;
}

// Validate LDAP configuration
export function validateLdapConfig(ldapConfig: AuthConfig["ldap"]): string[] {
  const errors: string[] = [];
  
  if (!ldapConfig.enabled) return errors;
  
  if (!ldapConfig.url) errors.push("LDAP_URL is required when LDAP is enabled");
  if (!ldapConfig.bindDn) errors.push("LDAP_BIND_DN is required when LDAP is enabled");
  if (!ldapConfig.bindPassword) errors.push("LDAP_BIND_PASSWORD is required when LDAP is enabled");
  if (!ldapConfig.baseDn) errors.push("LDAP_BASE_DN is required when LDAP is enabled");
  
  // Ensure LDAPS or StartTLS for security
  if (ldapConfig.url && !ldapConfig.url.startsWith("ldaps://") && !ldapConfig.startTls) {
    errors.push("LDAP requires LDAPS (ldaps://) or StartTLS for security");
  }
  
  return errors;
}

// Get the global auth configuration
export const authConfig = loadAuthConfig();
