import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/authorization";
import { appRoleEnum } from "@shared/schemas";
import { generateInviteToken, getInviteBaseUrl, sendInviteEmail } from "../utils/invitation.utils";
import { logAuthorizationFailure } from "../utils/authorization.utils";
import { getInvitationService, getAuthProviderService } from "../services/service-factory";

const router = Router();

// Validation schema for invitation requests
const inviteRequestSchema = z.object({
  email: z.string().email(),
  roles: z.array(z.string().min(1)).min(1),
  departmentId: z.string().uuid().optional().or(z.literal('').transform(()=>undefined)),
  divisionId: z.string().uuid().optional().or(z.literal('').transform(()=>undefined)),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
});

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
        lastName: parsed.lastName
      });

      await sendInviteEmail(invitation.email, invitation.token, new Date(invitation.expiresAt));

      res.status(201).json({
        id: invitation.id,
        expiresAt: invitation.expiresAt
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Invalid data",
          errors: error.flatten()
        });
      }
      next(error);
    }
  }
);

// GET /api/invitations/accept - Accept an invitation
router.get("/invitations/accept", async (req: any, res, next) => {
  try {
    const tokenParam = req.query?.token;
    const token = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam;

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
        console.error("Failed to persist invitation token in session", err);
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
    const updatedProvider = await authProviderServiceForUpdate.updateAuthProvider(id, { enabled });

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
    // Prepare masked response
    const response = {
      settings: {
        url: cfg.url,
        startTls: !!cfg.startTls,
        baseDn: cfg.baseDn,
        userFilter: cfg.userFilter,
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
    const patch = req.body || {};
    // Normalize boolean
    if (patch.startTls !== undefined) patch.startTls = !!patch.startTls;
    const authProviderService = getAuthProviderService();
    const updated = await authProviderService.setLdapSettings(patch);
    // Reinitialize providers to apply changes immediately
    try {
      const { initializeAuthProviders } = await import('../features/auth/services');
      await initializeAuthProviders();
    } catch (e) {
      console.error('Failed to reinitialize auth providers after LDAP settings update:', e);
    }
    res.json({ ok: true });
  } catch (error) {
    await logAuthorizationFailure({ req, resource: "settings", action: "auth:ldap:update", reason: (error as Error)?.message ?? "update_failed" });
    next(error);
  }
});

// POST /api/auth/ldap/test - Test LDAP connection
router.post("/auth/ldap/test", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  const start = Date.now();
  try {
    const override = req.body || {};
    const authProviderService = getAuthProviderService();
    const current = await authProviderService.getLdapSettings();
    const cfg = { ...current, ...override };

    if (!cfg.url || !cfg.bindDn || !cfg.bindPassword || !cfg.baseDn) {
      return res.status(400).json({ ok: false, message: 'Missing required settings (url, bindDn, bindPassword, baseDn)' });
    }

    const ldapMod: any = await import('ldapjs');
    const createClient: any = ldapMod?.createClient ?? ldapMod?.default?.createClient;
    if (typeof createClient !== 'function') {
      console.error('ldapjs module shape unexpected:', Object.keys(ldapMod || {}));
      return res.status(500).json({ ok: false, message: 'LDAP library load failed' });
    }
    const client = createClient({ url: cfg.url, connectTimeout: 10000, timeout: 10000 });

    const doTest = () => new Promise<{ ok: boolean; message: string }>((resolve) => {
      client.on('error', (err: any) => {
        console.error('LDAP test connection error:', err);
        resolve({ ok: false, message: 'Connection failed' });
      });

      client.bind(cfg.bindDn!, cfg.bindPassword!, (bindErr: any) => {
        if (bindErr) {
          console.error('LDAP test bind error:', bindErr);
          client.destroy();
          resolve({ ok: false, message: 'Bind failed' });
          return;
        }
        // Optional: quick search to verify baseDn reachable
        const opts = { filter: cfg.userFilter || '(objectClass=person)', scope: 'base' as const };
        client.search(cfg.baseDn!, opts, (searchErr: any, searchRes: any) => {
          if (searchErr) {
            console.error('LDAP test search error:', searchErr);
            client.destroy();
            resolve({ ok: false, message: 'Search failed' });
            return;
          }
          searchRes.on('end', () => {
            client.destroy();
            resolve({ ok: true, message: 'OK' });
          });
          searchRes.on('error', (err: any) => {
            console.error('LDAP test search result error:', err);
            client.destroy();
            resolve({ ok: false, message: 'Search error' });
          });
        });
      });
    });

    const result = await doTest();
    res.json({ ...result, durationMs: Date.now() - start });
  } catch (error) {
    await logAuthorizationFailure({ req, resource: "settings", action: "auth:ldap:test", reason: (error as Error)?.message ?? "test_failed" });
    next(error);
  }
});

export default router;
