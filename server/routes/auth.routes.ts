import { Router } from "express";
import { z } from "zod";
import passport from "passport";
import { requireAuth, requireRole } from "../middleware/authorization";
import { isZodError } from "../middleware/validation";
import { appRoleEnum } from "@shared/schemas";
import { generateInviteToken, getInviteBaseUrl, sendInviteEmail } from "../utils/invitation.utils";
import { logAuthorizationFailure } from "../utils/authorization.utils";
import { getInvitationService, getAuthProviderService, getUserService } from "../services/service-factory";
import { checkLoginLimits, recordLoginFailure, resetLoginLimit } from "../services/login-rate-limit";
import { comparePasswords } from "../utils/passwords";
import { hydrateAuthUser } from "../features/auth/services";
import { FIXED_LDAP_USER_FILTER_TEMPLATE, normalizeLdapBindDn } from '../features/auth/identifier';
import { logger } from "../utils/logger";
import { resolveClientIp } from "../utils/ip-resolution";
import { isInvitationsEnabled } from "../utils/feature-flags";

const router = Router();

// ============================================
// Authentication Endpoints (aliased from /api/*)
// ============================================

/**
 * POST /api/auth/login
 * Authenticate user with username/email and password
 * 
 * In production: Uses Passport LocalStrategy
 * In tests: Direct authentication via mock authentication service
 */
router.post("/auth/login", async (req, res, next) => {
  const clientIp = resolveClientIp(req);

  // Validate request body
  const { email, username, password } = req.body;
  
  if (!password) {
    return res.status(400).json({ message: 'Password is required' });
  }
  
  if (!email && !username) {
    return res.status(400).json({ message: 'Email or username is required' });
  }
  
  // Email format validation using Zod's .email() validator
  if (email && !z.string().email().safeParse(email).success) {
    return res.status(400).json({ message: 'Invalid email format' });
  }
  
  // Check if Passport is configured (production mode)
  const hasPassport = req.app.get('passport') !== undefined || (req as any).login !== undefined;
  
  if (hasPassport && passport.authenticate) {
    // Production mode: use Passport authentication
    const identifier = email || username || "";

    const limitCheck = await checkLoginLimits({ identifier, ip: clientIp });
    if (!limitCheck.allowed) {
      if (limitCheck.retryAfterSeconds) {
        res.setHeader("Retry-After", String(limitCheck.retryAfterSeconds));
      }
      return res.status(limitCheck.status).json({ message: limitCheck.message });
    }

    return passport.authenticate("local", async (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) {
        await recordLoginFailure({ identifier, ip: clientIp });
        return res.status(401).json({ message: info?.message || 'Authentication failed' });
      }
      
      try {
        // Establish session
        req.logIn(user, async (loginErr) => {
          if (loginErr) return next(loginErr);
          
          // Track last login time
          if (user.id) {
            try {
              const userService = getUserService();
              await userService.updateLastLogin(user.id);
            } catch (error) {
              // Don't fail login if last login update fails
              logger.error('Failed to update last login', error);
            }
          }

          await resetLoginLimit({ identifier, ip: clientIp });
          
          res.status(200).json({ user });
        });
      } catch (error) {
        next(error);
      }
    })(req, res, next);
  } else {
    // Test mode: manual authentication (passport not available)
    try {
      const { email, username, password } = req.body;
      const userService = getUserService();

      const identifier = email || username;
      const limitCheck = await checkLoginLimits({ identifier, ip: clientIp });
      if (!limitCheck.allowed) {
        if (limitCheck.retryAfterSeconds) {
          res.setHeader("Retry-After", String(limitCheck.retryAfterSeconds));
        }
        return res.status(limitCheck.status).json({ message: limitCheck.message });
      }
      
      // Try to find user by email or username
      const user = email 
        ? await userService.getUserByEmail(email)
        : username 
          ? await userService.getUserByUsername(username)
          : null;
      
      if (!user || !user.passwordHash) {
        await recordLoginFailure({ identifier, ip: clientIp });
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      
      // Check if user is active
      if (user.status !== 'active') {
        return res.status(401).json({ message: 'Account is not active' });
      }
      
      // Verify password using shared utility (supports both bcrypt and scrypt formats)
      const validPassword = await comparePasswords(password, user.passwordHash);
      
      if (!validPassword) {
        await recordLoginFailure({ identifier, ip: clientIp });
        return res.status(401).json({ message: 'Invalid credentials' });
      }
      
      // Hydrate user with roles and scopes using shared utility
      try {
        const enrichedUser = await hydrateAuthUser(user);
        
        // Remove sensitive fields before persisting
        (enrichedUser as any).passwordHash = undefined;
        delete (enrichedUser as any).password;

        if (req.session) {
          // Preserve CSRF secret across session regeneration
          const csrfSecret = req.session.csrfSecret;

          // Regenerate to avoid fixation even in test mode, but don't fail login if it errors
          if (typeof req.session.regenerate === "function") {
            await new Promise<void>((resolve) => {
              req.session!.regenerate(() => {
                // Restore CSRF secret inside callback to ensure it's preserved in the new session
                if (csrfSecret) req.session!.csrfSecret = csrfSecret;
                resolve();
              });
            });
          } else {
            // No regenerate function available, just restore the secret
            if (csrfSecret) req.session.csrfSecret = csrfSecret;
          }

          req.session.user = enrichedUser as any;
          if (typeof req.session.save === "function") {
            await new Promise<void>((resolve) => req.session!.save(() => resolve()));
          }
        }
        
        req.user = enrichedUser as any;
        (req as any).isAuthenticated = () => true;
        await resetLoginLimit({ identifier, ip: clientIp });
        res.status(200).json({ user: enrichedUser });
      } catch (hydrationError) {
        // If hydration fails, fall back to basic user (test environment may not have all data)
        logger.error('User hydration error', hydrationError);
        const basicUser = {
          ...user,
          roles: [user.role],
          departmentScopes: [],
          divisionScopes: [],
          managedCandidateIds: []
        };
        (basicUser as any).passwordHash = undefined;
        delete (basicUser as any).password;

        if (req.session) {
          // Preserve CSRF secret across session regeneration
          const csrfSecret = req.session.csrfSecret;

          if (typeof req.session.regenerate === "function") {
            await new Promise<void>((resolve) => {
              req.session!.regenerate(() => {
                // Restore CSRF secret inside callback to ensure it's preserved in the new session
                if (csrfSecret) req.session!.csrfSecret = csrfSecret;
                resolve();
              });
            });
          } else {
            // No regenerate function available, just restore the secret
            if (csrfSecret) req.session.csrfSecret = csrfSecret;
          }

          req.session.user = basicUser as any;
          if (typeof req.session.save === "function") {
            await new Promise<void>((resolve) => req.session!.save(() => resolve()));
          }
        }

        req.user = basicUser as any;
        (req as any).isAuthenticated = () => true;
        await resetLoginLimit({ identifier, ip: clientIp });
        res.status(200).json({ user: basicUser });
      }
    } catch (error) {
      next(error);
    }
  }
});

/**
 * POST /api/auth/logout  
 * End user session
 */
router.post("/auth/logout", (req, res, next) => {
  if (req.logout) {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  } else {
    // Test mode: clear mock session and destroy any in-memory session store
    if (req.session) {
      req.session.destroy((destroyErr) => {
        if (destroyErr) {
          logger.error("Failed to destroy session during logout", destroyErr);
        }
        req.user = undefined;
        res.sendStatus(200);
      });
    } else {
      req.user = undefined;
      res.sendStatus(200);
    }
  }
});

/**
 * GET /api/user
 * Get current authenticated user
 */
router.get("/user", (req, res) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.sendStatus(401);
  }
  res.json(req.user);
});


// ============================================
// Invitation Routes
// ============================================

function requireInvitationsEnabled(req: any, res: any, next: any) {
  if (!isInvitationsEnabled()) {
    return res.status(404).json({ message: "Not found" });
  }
  next();
}

const inviteRequestSchema = z.object({
  email: z.string().email(),
  roles: z.array(z.string().min(1)).min(1),
  departmentId: z.string().uuid().optional().or(z.literal('').transform(()=>undefined)),
  divisionId: z.string().uuid().optional().or(z.literal('').transform(()=>undefined)),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
});

const ldapSettingsPatchSchema = z.object({
  url: z.string().optional(),
  startTls: z.coerce.boolean().optional(),
  verifyTlsCert: z.coerce.boolean().optional(),
  baseDn: z.string().optional(),
  bindDn: z.string().optional(),
  bindPassword: z.string().optional(),
  usernameAttr: z.string().optional(),
  firstNameAttr: z.string().optional(),
  lastNameAttr: z.string().optional(),
  emailAttr: z.string().optional(),
  disabledFilter: z.string().optional(),
});

const LDAP_TEST_BASE_DN_FILTER = "(objectClass=*)";

function normalizeOptionalString(value?: string): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

// Helper function to check if a provider is configured
async function checkProviderConfiguration(providerId: string): Promise<boolean> {
  const authProviderService = getAuthProviderService();
  switch (providerId) {
    case 'local':
      return true; // Local is always configured
    case 'ldap':
      return await authProviderService.getLdapConfigured();
    case 'google':
      return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    case 'azuread':
      return !!(process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET && process.env.AZURE_TENANT_ID);
    default:
      return false;
  }
}

// Helper function to mask sensitive IDs
function maskId(s?: string): string | undefined {
  if (!s) return undefined;
  return `${"x".repeat(Math.max(0, s.length - 4))}${s.slice(-4)}`;
}

// Helper function to get provider details
async function getProviderDetails(providerId: string) {
  const authProviderService = getAuthProviderService();
  switch (providerId) {
    case 'local':
      return {
        clientIdMasked: undefined,
        callbackUrl: undefined,
        notes: 'Built-in password authentication'
      };
    case 'ldap': {
      const cfg = await authProviderService.getLdapSettings();
      return {
        clientIdMasked: maskId(cfg.bindDn),
        callbackUrl: cfg.url,
        notes: 'Active Directory/LDAP authentication'
      };
    }
    case 'google':
      return {
        clientIdMasked: maskId(process.env.GOOGLE_CLIENT_ID),
        callbackUrl: process.env.GOOGLE_CALLBACK_URL || `${process.env.BASE_URL || 'http://localhost:5000'}/auth/google/callback`,
        notes: 'Google OAuth 2.0 authentication'
      };
    case 'azuread':
      return {
        clientIdMasked: maskId(process.env.AZURE_CLIENT_ID),
        callbackUrl: process.env.AZURE_CALLBACK_URL || `${process.env.BASE_URL || 'http://localhost:5000'}/auth/azuread/callback`,
        notes: 'Microsoft Azure Active Directory authentication'
      };
    default:
      return {
        clientIdMasked: undefined,
        callbackUrl: undefined,
        notes: 'Unknown provider'
      };
  }
}

// ============================================
// Invitation Routes
// ============================================

// POST /api/invitations - Create a new invitation
router.post(
  "/invitations",
  requireInvitationsEnabled,
  requireAuth,
  requireRole(["system_admin", "hr_staff"]),
  async (req, res, next) => {
    try {
      const parsed = inviteRequestSchema.parse(req.body ?? {});
      const normalizedEmail = parsed.email.trim().toLowerCase();
      const rolesInput = parsed.roles.map(role => role.trim().toLowerCase());
      const allowedRoles = new Set<string>([...appRoleEnum.enumValues]);
      const invalidRoles = rolesInput.filter(role => !allowedRoles.has(role));

      if (invalidRoles.length > 0) {
        return res.status(400).json({
          message: `Invalid role(s): ${invalidRoles.join(', ')}`
        });
      }

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const token = generateInviteToken();

      const invitationService = getInvitationService();
      const { invitation } = await invitationService.createInvitation({
        email: normalizedEmail,
        roles: rolesInput,
        invitedBy: req.user!.id,
        expiresAt,
        departmentId: parsed.departmentId,
        divisionId: parsed.divisionId,
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        requestId: req.id
      });

      await sendInviteEmail(invitation.email, invitation.token, new Date(invitation.expiresAt));

      res.status(201).json({
        id: invitation.id,
        expiresAt: invitation.expiresAt
      });
    } catch (error) {
      if (isZodError(error)) {
        return res.status(400).json({
          message: "Invalid data",
          errors: error.flatten()
        });
      }
      next(error);
    }
  }
);

// DELETE /api/invitations/:id - Cancel a pending invitation
router.delete(
  "/invitations/:id",
  requireInvitationsEnabled,
  requireAuth,
  requireRole(["system_admin", "hr_staff"]),
  async (req, res, next) => {
    try {
      const invitationId = req.params.id;

      const invitationService = getInvitationService();
      const success = await invitationService.cancelInvitation(
        invitationId,
        req.user?.id,
        req.id
      );

      if (!success) {
        return res.status(404).json({ message: "Invitation not found" });
      }

      res.json({ message: "Invitation canceled successfully" });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/invitations/accept - Accept an invitation
// Changed from GET to POST to properly apply CSRF protection for this state-changing operation
router.post("/invitations/accept", requireInvitationsEnabled, async (req: any, res, next) => {
  try {
    // Token now comes from request body instead of query params
    const token = req.body?.token;

    if (!token || typeof token !== "string" || token.trim() === "") {
      return res.status(400).json({ message: "Invite token is required" });
    }

    const invitationService = getInvitationService();
    const invitation = await invitationService.getInvitationByToken(token);

    if (!invitation || invitation.status !== "pending") {
      return res.status(410).json({ message: "Invite is invalid or expired" });
    }

    const expiresAt = new Date(invitation.expiresAt);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
      return res.status(410).json({ message: "Invite is invalid or expired" });
    }

    req.session.inviteToken = token;
    req.session.inviteTokenEmail = invitation.email;
    req.session.inviteTokenIssuedAt = new Date().toISOString();
    req.session.save((err: unknown) => {
      if (err) {
        logger.error("Failed to persist invitation token in session", err);
        return res.status(500).json({ message: "Unable to store invite token" });
      }
      res.json({
        email: invitation.email,
        expiresAt: invitation.expiresAt
      });
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// Auth Provider Management Routes
// ============================================

// GET /api/auth/providers - List all authentication providers
router.get("/auth/providers", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    const authProviderService = getAuthProviderService();
    const dbProviders = await authProviderService.getAllAuthProviders();
    const providerInfos = await Promise.all(dbProviders.map(async (dbProvider) => {
      const configured = await checkProviderConfiguration(dbProvider.id);
      const details = await getProviderDetails(dbProvider.id);
      return {
        id: dbProvider.id as "local" | "ldap" | "google" | "azuread",
        name: dbProvider.name,
        enabled: dbProvider.enabled,
        configured,
        effectiveEnabled: Boolean(dbProvider.enabled && configured),
        canEnable: Boolean(configured),
        ...details
      };
    }));
    res.json(providerInfos);
  } catch (error) {
    next(error);
  }
});

// PATCH /api/auth/providers/:id - Update authentication provider settings
router.patch("/auth/providers/:id", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ message: "enabled field must be a boolean" });
    }

    // Validate provider ID
    if (!['local', 'ldap', 'google', 'azuread'].includes(id)) {
      return res.status(404).json({ message: "Provider not found" });
    }

    // Check if trying to enable an unconfigured provider
    const configured = await checkProviderConfiguration(id);
    if (enabled && !configured) {
      return res.status(400).json({
        message: "Provider is not configured. Please configure settings first."
      });
    }

    // Don't allow disabling local provider if it's the only enabled AND configured one
    if (id === 'local' && !enabled) {
      const authProviderService = getAuthProviderService();
      const allProviders = await authProviderService.getAllAuthProviders();
      const otherViableProviders = allProviders.filter(p =>
        p.id !== 'local' &&
        p.enabled &&
        checkProviderConfiguration(p.id)
      );

      if (otherViableProviders.length === 0) {
        return res.status(400).json({
          message: "Cannot disable local authentication when no other configured providers are enabled"
        });
      }
    }

    const authProviderServiceForUpdate = getAuthProviderService();
    const updatedProvider = await authProviderServiceForUpdate.updateAuthProvider(id, { enabled }, req.user?.id, req.id);

    if (!updatedProvider) {
      return res.status(404).json({ message: "Provider not found" });
    }

    const details = await getProviderDetails(id);

    const result = {
      id: updatedProvider.id as "local" | "ldap" | "google" | "azuread",
      name: updatedProvider.name,
      enabled: updatedProvider.enabled,
      configured,
      effectiveEnabled: Boolean(updatedProvider.enabled && configured),
      canEnable: Boolean(configured),
      ...details
    };

    res.json(result);
  } catch (error) {
    next(error);
  }
});

// ============================================
// LDAP Settings Routes
// ============================================

// GET /api/auth/ldap - Get LDAP settings
router.get("/auth/ldap", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    const authProviderService = getAuthProviderService();
    const cfg = await authProviderService.getLdapSettings();
    const configured = await authProviderService.getLdapConfigured();
    const warnings: string[] = [];
    if (cfg.url && !cfg.url.startsWith('ldaps://') && !cfg.startTls) {
      warnings.push('LDAP requires LDAPS (ldaps://) or StartTLS for security');
    }
    if (cfg.startTls && cfg.verifyTlsCert === false) {
      warnings.push('LDAP StartTLS certificate verification is disabled');
    }
    // Prepare masked response
    const response = {
      settings: {
        url: cfg.url,
        startTls: !!cfg.startTls,
        verifyTlsCert: !!cfg.verifyTlsCert,
        baseDn: cfg.baseDn,
        userFilter: FIXED_LDAP_USER_FILTER_TEMPLATE,
        usernameAttr: cfg.usernameAttr,
        firstNameAttr: cfg.firstNameAttr,
        lastNameAttr: cfg.lastNameAttr,
        emailAttr: cfg.emailAttr,
        disabledFilter: cfg.disabledFilter,
        bindDnMasked: cfg.bindDn ? maskId(cfg.bindDn) : undefined,
        hasPassword: !!cfg.bindPassword,
      },
      configured,
      warnings
    };
    res.json(response);
  } catch (error) {
    next(error);
  }
});

// PUT /api/auth/ldap - Update LDAP settings
router.put("/auth/ldap", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    const parsedPatch = ldapSettingsPatchSchema.parse(req.body ?? {});
    const patch = {
      url: normalizeOptionalString(parsedPatch.url),
      startTls: parsedPatch.startTls,
      verifyTlsCert: parsedPatch.verifyTlsCert,
      baseDn: normalizeOptionalString(parsedPatch.baseDn),
      bindDn: normalizeOptionalString(parsedPatch.bindDn),
      bindPassword: parsedPatch.bindPassword,
      usernameAttr: normalizeOptionalString(parsedPatch.usernameAttr),
      firstNameAttr: normalizeOptionalString(parsedPatch.firstNameAttr),
      lastNameAttr: normalizeOptionalString(parsedPatch.lastNameAttr),
      emailAttr: normalizeOptionalString(parsedPatch.emailAttr),
      disabledFilter: normalizeOptionalString(parsedPatch.disabledFilter),
    };
    const authProviderService = getAuthProviderService();
    await authProviderService.setLdapSettings(patch, req.user?.id, req.id);
    // Reinitialize providers to apply changes immediately
    try {
      const { initializeAuthProviders } = await import('../features/auth/services');
      await initializeAuthProviders();
    } catch (e) {
      logger.error('Failed to reinitialize auth providers after LDAP settings update', e);
    }
    res.json({ ok: true });
  } catch (error) {
    if (isZodError(error)) {
      return res.status(400).json({
        message: "Invalid LDAP settings",
        errors: error.flatten()
      });
    }
    await logAuthorizationFailure({ req, resource: "settings", action: "auth:ldap:update", reason: (error as Error)?.message ?? "update_failed" });
    next(error);
  }
});

// POST /api/auth/ldap/test - Test LDAP connection
router.post("/auth/ldap/test", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  const start = Date.now();
  try {
    const parsedOverride = ldapSettingsPatchSchema.parse(req.body ?? {});
    const override = {
      url: normalizeOptionalString(parsedOverride.url),
      startTls: parsedOverride.startTls,
      verifyTlsCert: parsedOverride.verifyTlsCert,
      baseDn: normalizeOptionalString(parsedOverride.baseDn),
      bindDn: normalizeOptionalString(parsedOverride.bindDn),
      bindPassword: parsedOverride.bindPassword,
      usernameAttr: normalizeOptionalString(parsedOverride.usernameAttr),
      firstNameAttr: normalizeOptionalString(parsedOverride.firstNameAttr),
      lastNameAttr: normalizeOptionalString(parsedOverride.lastNameAttr),
      emailAttr: normalizeOptionalString(parsedOverride.emailAttr),
      disabledFilter: normalizeOptionalString(parsedOverride.disabledFilter),
    };
    const authProviderService = getAuthProviderService();
    const current = await authProviderService.getLdapSettings();
    const cfg = {
      url: override.url ?? current?.url,
      startTls: override.startTls ?? current?.startTls,
      verifyTlsCert: override.verifyTlsCert ?? current?.verifyTlsCert ?? false,
      baseDn: override.baseDn ?? current?.baseDn,
      bindDn: override.bindDn ?? current?.bindDn,
      bindPassword: override.bindPassword ?? current?.bindPassword,
      usernameAttr: override.usernameAttr ?? current?.usernameAttr,
      firstNameAttr: override.firstNameAttr ?? current?.firstNameAttr,
      lastNameAttr: override.lastNameAttr ?? current?.lastNameAttr,
      emailAttr: override.emailAttr ?? current?.emailAttr,
      disabledFilter: override.disabledFilter ?? current?.disabledFilter,
      userFilter: FIXED_LDAP_USER_FILTER_TEMPLATE,
    };

    if (!cfg.url || !cfg.bindDn || !cfg.bindPassword || !cfg.baseDn) {
      return res.status(400).json({ ok: false, message: 'Missing required settings (url, bindDn, bindPassword, baseDn)' });
    }

    // Normalize bare username to UPN format (e.g. jesteen → jesteen@ad.hs.uab.edu)
    cfg.bindDn = normalizeLdapBindDn(cfg.bindDn, cfg.url);

    const ldapMod: any = await import('ldapjs');
    const createClient: any = ldapMod?.createClient ?? ldapMod?.default?.createClient;
    if (typeof createClient !== 'function') {
      logger.error('ldapjs module shape unexpected', undefined, { keys: Object.keys(ldapMod || {}) });
      return res.status(500).json({ ok: false, message: 'LDAP library load failed' });
    }
    const client = createClient({ url: cfg.url, connectTimeout: 10000, timeout: 10000 });

    const doTest = () => new Promise<{ ok: boolean; message: string }>((resolve) => {
      client.on('error', (err: any) => {
        logger.error('LDAP test connection error', err);
        resolve({ ok: false, message: `Connection failed: ${err.message || err.code || 'unknown'}` });
      });

      const performBind = () => {
        logger.debug('LDAP test: attempting bind', { bindDn: cfg.bindDn, url: cfg.url, startTls: cfg.startTls });
        client.bind(cfg.bindDn!, cfg.bindPassword!, (bindErr: any) => {
          if (bindErr) {
            logger.error('LDAP test bind error', bindErr);
            client.destroy();
            resolve({ ok: false, message: `Bind failed: ${bindErr.lde_message || bindErr.message || bindErr.code || 'unknown'}` });
            return;
          }
          // Optional: quick search to verify baseDn reachable
          const opts = { filter: LDAP_TEST_BASE_DN_FILTER, scope: 'base' as const };
          client.search(cfg.baseDn!, opts, (searchErr: any, searchRes: any) => {
            if (searchErr) {
              logger.error('LDAP test search error', searchErr);
              client.destroy();
              resolve({ ok: false, message: 'Search failed' });
              return;
            }
            searchRes.on('end', () => {
              client.destroy();
              resolve({ ok: true, message: 'OK' });
            });
            searchRes.on('error', (err: any) => {
              logger.error('LDAP test search result error', err);
              client.destroy();
              resolve({ ok: false, message: 'Search error' });
            });
          });
        });
      };

      if (cfg.startTls) {
        logger.debug('LDAP test: initiating StartTLS', {
          url: cfg.url,
          verifyTlsCert: cfg.verifyTlsCert
        });
        client.starttls({ rejectUnauthorized: cfg.verifyTlsCert === true }, null, (tlsErr: any) => {
          if (tlsErr) {
            logger.error('LDAP test StartTLS error', tlsErr);
            client.destroy();
            resolve({ ok: false, message: `StartTLS negotiation failed: ${tlsErr.message || tlsErr.code || 'unknown'}` });
            return;
          }
          logger.debug('LDAP test: StartTLS successful');
          performBind();
        });
      } else {
        performBind();
      }
    });

    const result = await doTest();
    res.json({ ...result, durationMs: Date.now() - start });
  } catch (error) {
    if (isZodError(error)) {
      return res.status(400).json({
        message: "Invalid LDAP test settings",
        errors: error.flatten()
      });
    }
    await logAuthorizationFailure({ req, resource: "settings", action: "auth:ldap:test", reason: (error as Error)?.message ?? "test_failed" });
    next(error);
  }
});

export default router;
