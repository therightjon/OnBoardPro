// Authentication provider interfaces and implementations

import type { User, InsertUser, UserIdentity, InsertUserIdentity } from "@shared/schemas";
import { buildLdapUserSearchFilter, toLdapUsername } from "../identifier";

// Common user profile from any provider
export interface UserProfile {
  externalId: string;
  email: string;
  firstName: string;
  lastName: string;
  username?: string;
  emailVerified?: boolean;
}

// Authentication result from provider
export interface AuthResult {
  success: boolean;
  user?: UserProfile;
  error?: string;
}

// Base authentication provider interface
export interface AuthProvider {
  name: string;
  authenticate(credentials: Record<string, any>): Promise<AuthResult>;
  validateConfig(): string[];
}

// Local provider implementation
export class LocalAuthProvider implements AuthProvider {
  name = "local";

  async authenticate(credentials: { email: string; password: string }): Promise<AuthResult> {
    // This will be handled by the existing Passport local strategy
    // We don't implement this here as it's already working
    return { success: false, error: "Local auth handled by Passport" };
  }

  validateConfig(): string[] {
    return []; // No additional config needed for local auth
  }
}

// LDAP provider implementation  
export class LdapAuthProvider implements AuthProvider {
  name = "ldap";
  private config: any;

  constructor(config: any) {
    this.config = config;
  }

  async authenticate(credentials: { username: string; password: string }): Promise<AuthResult> {
    const { username, password } = credentials;
    const originalInput = username;
    const ldapUser = toLdapUsername(username ?? "");

    if (!ldapUser || !password) {
      return { success: false, error: "Username and password required" };
    }

    try {
      // Import LDAP library dynamically (support ESM/CJS shapes)
      const ldapMod: any = await import('ldapjs');
      const createClient: any = ldapMod?.createClient ?? ldapMod?.default?.createClient;
      if (typeof createClient !== 'function') {
        console.error('ldapjs module shape unexpected in provider:', Object.keys(ldapMod || {}));
        return { success: false, error: 'LDAP library load failed' };
      }

      // Create LDAP client
      const client = createClient({
        url: (this.config.url || '').trim(),
        connectTimeout: 10000,
        timeout: 10000,
      });

      return new Promise((resolve) => {
        let userProfile: UserProfile | null = null;

        // Handle connection errors
        client.on('error', (err: any) => {
          console.error('LDAP connection error:', err);
          resolve({ success: false, error: 'LDAP connection failed' });
        });

        // Step 1: Optionally upgrade to TLS, then bind with service account
        const performServiceBind = () => {
          client.bind(this.config.bindDn, this.config.bindPassword, (bindErr: any) => {
            if (bindErr) {
              console.error('LDAP bind error:', bindErr);
              client.destroy();
              resolve({ success: false, error: 'LDAP authentication failed' });
              return;
            }

          // Step 2: Search for user
          const searchFilter = buildLdapUserSearchFilter(username ?? "");
          const searchOptions = {
            filter: searchFilter,
            scope: 'sub' as const,
            attributes: [
              this.config.usernameAttr,
              this.config.firstNameAttr,
              this.config.lastNameAttr,
              this.config.emailAttr,
              'dn'
            ]
          };

          client.search(this.config.baseDn, searchOptions, (searchErr: any, searchRes: any) => {
            if (searchErr) {
              console.error('LDAP search error:', searchErr);
              client.destroy();
              resolve({ success: false, error: 'User search failed' });
              return;
            }

            let foundUser = false;
            let userDn = '';

            searchRes.on('searchEntry', (entry: any) => {
              foundUser = true;
              // Extract DN robustly across ldapjs versions
              try {
                const dnCandidate = (entry && (entry.objectName ?? entry.dn)) as any;
                userDn = typeof dnCandidate === 'string' ? dnCandidate : (dnCandidate?.toString?.() ?? '');
              } catch {
                userDn = '';
              }
              
              const attrs = entry.attributes.reduce((acc: any, attr: any) => {
                acc[attr.type] = Array.isArray(attr.values) ? attr.values[0] : attr.values;
                return acc;
              }, {});

              const rawUsername = (attrs[this.config.usernameAttr] ?? ldapUser) as string;
              const rawEmail = (attrs[this.config.emailAttr] ?? '') as string;
              userProfile = {
                externalId: userDn,
                username: rawUsername ? String(rawUsername).toLowerCase() : '',
                firstName: attrs[this.config.firstNameAttr] || '',
                lastName: attrs[this.config.lastNameAttr] || '',
                email: rawEmail ? String(rawEmail).toLowerCase() : '',
                emailVerified: true // Assume LDAP emails are verified
              };
            });

            searchRes.on('error', (err: any) => {
              console.error('LDAP search result error:', err);
              client.destroy();
              resolve({ success: false, error: 'User search failed' });
            });

            searchRes.on('end', () => {
              if (!foundUser || !userDn || typeof userDn !== 'string') {
                client.destroy();
                resolve({ success: false, error: 'User not found' });
                return;
              }

              // Step 3: Verify user password by binding with user credentials
              const passwordStr = typeof password === 'string' ? password : String(password ?? '');
              if (!passwordStr) {
                client.destroy();
                resolve({ success: false, error: 'Username and password required' });
                return;
              }

              client.bind(userDn, passwordStr, (userBindErr: any) => {
                client.destroy();
                
                if (userBindErr) {
                  console.error('LDAP user bind error:', userBindErr, { input: originalInput });
                  resolve({ success: false, error: 'Invalid credentials' });
                  return;
                }

                resolve({ 
                  success: true, 
                  user: userProfile! 
                });
              });
            });
          });
        });
        };

        if (this.config.startTls) {
          client.starttls({}, null, (tlsErr: any) => {
            if (tlsErr) {
              console.error('LDAP StartTLS error:', tlsErr);
              client.destroy();
              resolve({ success: false, error: 'StartTLS negotiation failed' });
              return;
            }
            performServiceBind();
          });
        } else {
          performServiceBind();
        }
      });

    } catch (error) {
      console.error('LDAP authentication error:', error);
      return { success: false, error: 'LDAP authentication failed' };
    }
  }

  validateConfig(): string[] {
    const errors: string[] = [];
    
    if (!this.config.url) errors.push("LDAP_URL is required");
    if (!this.config.bindDn) errors.push("LDAP_BIND_DN is required");
    if (!this.config.bindPassword) errors.push("LDAP_BIND_PASSWORD is required");
    if (!this.config.baseDn) errors.push("LDAP_BASE_DN is required");
    
    // Security validation
    if (this.config.url && !this.config.url.startsWith("ldaps://") && !this.config.startTls) {
      errors.push("LDAP requires LDAPS or StartTLS for security");
    }
    
    return errors;
  }
}

// Provider registry
export class AuthProviderRegistry {
  private providers = new Map<string, AuthProvider>();

  register(provider: AuthProvider) {
    const errors = provider.validateConfig();
    if (errors.length > 0) {
      throw new Error(`Invalid ${provider.name} configuration: ${errors.join(', ')}`);
    }
    this.providers.set(provider.name, provider);
  }

  get(name: string): AuthProvider | undefined {
    return this.providers.get(name);
  }

  getEnabledProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  validateAll(): Record<string, string[]> {
    const validationResults: Record<string, string[]> = {};
    
    for (const [name, provider] of Array.from(this.providers.entries())) {
      const errors = provider.validateConfig();
      if (errors.length > 0) {
        validationResults[name] = errors;
      }
    }
    
    return validationResults;
  }
}
