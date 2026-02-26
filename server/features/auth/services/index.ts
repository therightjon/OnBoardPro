// Main authentication initialization and provider setup

import { authConfig, validateLdapConfig } from "./config";
import { AuthProviderRegistry, LocalAuthProvider, LdapAuthProvider } from "./providers";
import { authService } from "./service";
import { getAuthProviderService } from "../../../services/service-factory";

// Initialize the authentication provider registry
export const providerRegistry = new AuthProviderRegistry();

// Initialize all enabled providers
export async function initializeAuthProviders() {
  console.log("Initializing authentication providers...");
  
  try {
    // Get database provider settings
    const authProviderService = getAuthProviderService();
    const dbProviders = await authProviderService.getAllAuthProviders();
    const dbProviderMap = new Map(dbProviders.map(p => [p.id, p.enabled]));
    
    console.log(`Enabled providers: ${authConfig.enabledProviders.join(", ")}`);

    // Always register local provider if configured AND enabled in database
    const localEnabled = dbProviderMap.get('local') ?? true; // Default to true if not found
    if (authConfig.local.enabled && localEnabled) {
      try {
        const localProvider = new LocalAuthProvider();
        providerRegistry.register(localProvider);
        console.log("✓ Local authentication provider registered");
      } catch (error) {
        console.error("✗ Failed to register local provider:", error);
        throw error;
      }
    } else if (!localEnabled) {
      console.log("⚠ Local provider disabled in database");
    }

    // Register LDAP provider if enabled in database and DB-configured
    const ldapEnabled = dbProviderMap.get('ldap') ?? false;
    if (ldapEnabled) {
      try {
        const ldapCfg = await authProviderService.getLdapSettings();
        const ldapErrors = validateLdapConfig({ enabled: true, ...ldapCfg } as any);
        if (ldapErrors.length > 0) throw new Error(`LDAP configuration errors: ${ldapErrors.join(", ")}`);

        const ldapProvider = new LdapAuthProvider(ldapCfg as any);
        providerRegistry.register(ldapProvider);
        console.log("✓ LDAP authentication provider registered");
      } catch (error) {
        // Log but do NOT throw — LDAP failure must not prevent server startup or local auth
        console.error("✗ Failed to register LDAP provider (non-fatal, local auth unaffected):", error);
      }
    } else if (!ldapEnabled) {
      console.log("⚠ LDAP provider disabled in database");
    }

    // Future providers (Google, Azure AD) would be added here
    // const googleEnabled = dbProviderMap.get('google') ?? false;
    // const azureadEnabled = dbProviderMap.get('azuread') ?? false;
    
  } catch (error) {
    console.error("Failed to initialize auth providers:", error);
    // Fall back to environment-only configuration
    console.log("Falling back to environment-only configuration...");
    try {
      initializeProvidersFromConfig();
    } catch (fallbackError) {
      console.error("Fallback provider initialization also failed (non-fatal):", fallbackError);
      // Continue with whatever providers were successfully registered.
      // At minimum the server should start so local auth can work.
    }
    return;
  }

  // Future providers can be added here
  // if (authConfig.oidc.enabled) { ... }
  // if (authConfig.google.enabled) { ... }
  // if (authConfig.azuread.enabled) { ... }

  console.log(`Authentication system initialized with ${providerRegistry.getEnabledProviders().length} providers`);
}

// Fallback initialization using only environment configuration
function initializeProvidersFromConfig() {
  // Always register local provider if enabled
  if (authConfig.local.enabled) {
    try {
      const localProvider = new LocalAuthProvider();
      providerRegistry.register(localProvider);
      console.log("✓ Local authentication provider registered (config fallback)");
    } catch (error) {
      console.error("✗ Failed to register local provider:", error);
      throw error;
    }
  }

  // Register LDAP provider if enabled
  if (authConfig.ldap.enabled) {
    try {
      const ldapErrors = validateLdapConfig(authConfig.ldap);
      if (ldapErrors.length > 0) {
        throw new Error(`LDAP configuration errors: ${ldapErrors.join(", ")}`);
      }

      const ldapProvider = new LdapAuthProvider(authConfig.ldap);
      providerRegistry.register(ldapProvider);
      console.log("✓ LDAP authentication provider registered (config fallback)");
    } catch (error) {
      // Log but do NOT throw — LDAP failure must not prevent server startup or local auth
      console.error("✗ Failed to register LDAP provider (non-fatal, local auth unaffected):", error);
    }
  }
}

// Validate all provider configurations
export function validateProviderConfigurations(): Record<string, string[]> {
  return providerRegistry.validateAll();
}

// Get available providers for frontend
export function getAvailableProviders() {
  return {
    providers: authConfig.enabledProviders,
    local: authConfig.local.enabled,
    ldap: authConfig.ldap.enabled,
    oidc: authConfig.oidc.enabled,
    google: authConfig.google.enabled,
    azuread: authConfig.azuread.enabled
  };
}

// Export for use in other modules
export { authConfig, authService };
export { hydrateAuthUser } from "./auth.service";
