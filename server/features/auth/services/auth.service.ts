/**
 * Auth Service (passport/session setup)
 * Purpose: Configure local auth strategy, session store, and multi-provider hooks (Google/Azure/LDAP) for Express.
 * Belongs: Authentication bootstrapping only; business auth logic lives in services and middleware.
 * Conventions: Validate SESSION_SECRET early, hydrate user roles/scopes per request, prefer provider registry for new SSO integrations.
 */
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import bcrypt from "bcrypt";
import { getUserService } from "../../../services/service-factory";
import { User as SelectUser } from "@shared/schemas";
import { z } from "zod";
import connectPg from "connect-pg-simple";
import { pool } from "../../../config/database.config";
import {
  initializeAuthProviders, 
  providerRegistry, 
  authService, 
  getAvailableProviders,
  validateProviderConfigurations
} from "./index";
import { checkLoginLimits, recordLoginFailure, resetLoginLimit } from "../../../services/login-rate-limit";

declare global {
  namespace Express {
    interface User extends SelectUser {
      roles?: string[];
      departmentScopes?: string[];
      divisionScopes?: string[];
      managedCandidateIds?: string[];
    }
  }
}

declare module "express-session" {
  interface SessionData {
    inviteToken?: string;
    inviteTokenEmail?: string;
    inviteTokenIssuedAt?: string;
    csrfSecret?: string;
    lastActivity?: number;
  }
}

const PostgresSessionStore = connectPg(session);

const scryptAsync = promisify(scrypt);

/**
 * Hydrate a SelectUser with roles and scope metadata for session use.
 * Side effects: fetches roles/department/division/managed candidate scopes in parallel.
 */
async function hydrateAuthUser(user: SelectUser): Promise<Express.User> {
  const userService = getUserService();
  const [roles, departmentScopes, divisionScopes, managedCandidateIds] = await Promise.all([
    userService.getUserRoles(user.id),
    userService.getUserDepartmentScopeIds(user.id),
    userService.getUserDivisionScopeIds(user.id),
    userService.getManagerCandidateScopeIds(user.id)
  ]);

  const mergedRoles = Array.from(new Set([user.role, ...roles.map((r) => r.role)]));
  const departmentSet = new Set<string>(departmentScopes.filter(Boolean));
  const divisionSet = new Set<string>(divisionScopes.filter(Boolean));

  const managedSet = new Set<string>(managedCandidateIds.filter(Boolean));

  return {
    ...user,
    roles: mergedRoles,
    departmentScopes: Array.from(departmentSet),
    divisionScopes: Array.from(divisionSet),
    managedCandidateIds: Array.from(managedSet)
  };
}

/**
 * Compare supplied password against stored hash.
 * Handles bcrypt (legacy) and scrypt (new format); returns false on format errors to avoid timing leaks.
 * Uses constant-time comparison to prevent timing attacks.
 */
async function comparePasswords(supplied: string, stored: string) {
  try {
    // Check if it's a bcrypt hash (existing format)
    if (stored.startsWith('$2')) {
      return await bcrypt.compare(supplied, stored);
    }

    // Handle scrypt format (new format)
    const parts = stored.split(".");
    // Continue processing even if format is wrong to maintain constant timing
    const hashed = parts[0] || "";
    const salt = parts[1] || "dummysalt";

    // Always compute hash even if inputs are invalid to maintain constant timing
    const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;

    // Validate format after timing-sensitive operations
    if (parts.length !== 2 || !hashed || !parts[1]) {
      // Still return false but after performing the hash computation
      return false;
    }

    const hashedBuf = Buffer.from(hashed, "hex");

    if (hashedBuf.length !== suppliedBuf.length) {
      // Length mismatch - return false after timing-sensitive operations
      return false;
    }

    return timingSafeEqual(hashedBuf, suppliedBuf);
  } catch (error) {
    // Perform dummy operation to maintain timing even in error case
    try {
      await scryptAsync("dummy", "dummysalt", 64);
    } catch {
      // Ignore errors in dummy operation
    }
    console.error("Error comparing passwords:", error);
    return false;
  }
}

/**
 * Initialize authentication for the Express app.
 * Sets up passport strategies, session store, provider registry, and user serialization.
 * Throws if required secrets are missing or providers fail to initialize.
 */
export async function setupAuth(app: Express) {
  // Initialize multi-provider authentication system
  try {
    await initializeAuthProviders();
    console.log("✓ Multi-provider authentication system initialized successfully");
  } catch (error) {
    console.error("✗ Failed to initialize authentication providers:", error);
    throw error;
  }

  // Validate session secret exists
  if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET environment variable is required");
  }

  const TEN_HOURS_MS = 10 * 60 * 60 * 1000;

  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true, // Refresh cookie on each response while active
    store: new PostgresSessionStore({
      pool,
      createTableIfMissing: true
    }),
    cookie: {
      maxAge: TEN_HOURS_MS, // 10 hours
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: 'strict', // Prevent CSRF attacks
      ...(process.env.COOKIE_DOMAIN && { domain: process.env.COOKIE_DOMAIN })
    }
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(
      { usernameField: 'email' },
      async (email, password, done) => {
        try {
          const userService = getUserService();
          const user = await userService.getUserByEmail(email);
          if (!user || user.status !== 'active' || !user.passwordHash || !(await comparePasswords(password, user.passwordHash))) {
            return done(null, false);
          }
          const enriched = await hydrateAuthUser(user);
          return done(null, enriched);
        } catch (error) {
          return done(error);
        }
      }
    )
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: string, done) => {
    try {
      const userService = getUserService();
      const user = await userService.getUser(id);
      if (!user) {
        return done(null, false);
      }
      const enriched = await hydrateAuthUser(user);
      done(null, enriched);
    } catch (error) {
      done(error);
    }
  });

  app.post("/api/register", (_req, res) => {
    res.status(403).json({
      message: "Self-service registration is disabled. Please request an invitation."
    });
  });

  app.post("/api/login", async (req, res, next) => {
    try {
      const identifier = typeof req.body?.email === "string"
        ? req.body.email
        : typeof req.body?.username === "string"
          ? req.body.username
          : "";
      const clientIp = req.ip || req.headers["x-forwarded-for"] || req.connection?.remoteAddress || "";

      const limitCheck = await checkLoginLimits({ identifier, ip: Array.isArray(clientIp) ? clientIp[0] : String(clientIp) });
      if (!limitCheck.allowed) {
        if (limitCheck.retryAfterSeconds) {
          res.setHeader("Retry-After", String(limitCheck.retryAfterSeconds));
        }
        return res.status(limitCheck.status).json({ message: limitCheck.message });
      }

      passport.authenticate("local", async (err: any, user: any, info: any) => {
        if (err) return next(err);
        if (!user) {
          await recordLoginFailure({ identifier, ip: Array.isArray(clientIp) ? clientIp[0] : String(clientIp) });
          return res.status(401).json({ message: info?.message || "Authentication failed" });
        }

        try {
          const authenticatedUser = user;

          // Preserve invitation-related session data and CSRF secret across regeneration
          const { inviteToken, inviteTokenEmail, inviteTokenIssuedAt, csrfSecret } = req.session || {};

          // Regenerate session and restore data atomically to prevent race conditions
          await new Promise<void>((resolve, reject) => {
            req.session.regenerate((regenErr) => {
              if (regenErr) return reject(regenErr);

              // Restore session data immediately in callback to ensure CSRF protection works
              if (inviteToken) req.session.inviteToken = inviteToken;
              if (inviteTokenEmail) req.session.inviteTokenEmail = inviteTokenEmail;
              if (inviteTokenIssuedAt) req.session.inviteTokenIssuedAt = inviteTokenIssuedAt;
              if (csrfSecret) req.session.csrfSecret = csrfSecret;

              resolve();
            });
          });

          // Promisify login to ensure proper sequencing
          await new Promise<void>((resolve, reject) => {
            req.login(authenticatedUser, (loginErr) => {
              if (loginErr) return reject(loginErr);
              resolve();
            });
          });

          req.session.lastActivity = Date.now();

          // Explicitly save session to ensure all data is persisted
          await new Promise<void>((resolve, reject) => {
            req.session.save((saveErr) => {
              if (saveErr) {
                console.error('Session save error:', saveErr);
                return reject(saveErr);
              }
              resolve();
            });
          });

          // Track last login time (best-effort)
          if (authenticatedUser.id) {
            try {
              const userService = getUserService();
              await userService.updateLastLogin(authenticatedUser.id);
            } catch (updateErr) {
              console.error('Failed to update last login:', updateErr);
            }
          }

          await resetLoginLimit({ identifier, ip: Array.isArray(clientIp) ? clientIp[0] : String(clientIp) });

          res.status(200).json(req.user);
        } catch (error) {
          next(error);
        }
      })(req, res, next);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(req.user);
  });

  // Multi-provider authentication endpoints

  // Note: GET /api/auth/providers endpoint moved to routes.ts for admin management

  // Provider-specific authentication
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { provider, credentials } = req.body;

      if (!provider || !credentials) {
        return res.status(400).json({ 
          message: "Provider and credentials are required" 
        });
      }

      // Get the authentication provider
      const authProvider = providerRegistry.get(provider);
      if (!authProvider) {
        return res.status(400).json({ 
          message: `Authentication provider '${provider}' not available` 
        });
      }

      // Authenticate with the provider to get user profile
      const authResult = await authProvider.authenticate(credentials);
      
      if (!authResult.success) {
        return res.status(401).json({ 
          message: authResult.error || "Authentication failed" 
        });
      }

      // Use AuthService to handle user creation/update and sign-in
      const signInResult = await authService.signInWithProvider(provider, authResult.user!, {
        inviteToken: req.session?.inviteToken
      });
      
      if (!signInResult.success) {
        const statusCode = signInResult.statusCode ?? 401;
        return res.status(statusCode).json({ 
          message: signInResult.error || "Sign-in failed" 
        });
      }

      if (signInResult.consumedInvitationId && req.session) {
        delete req.session.inviteToken;
        delete req.session.inviteTokenEmail;
        delete req.session.inviteTokenIssuedAt;
      }

      // Log the user in using passport
      hydrateAuthUser(signInResult.user!).then(async (sessionUser) => {
        try {
          const { inviteToken, inviteTokenEmail, inviteTokenIssuedAt, csrfSecret } = req.session || {};

          // Regenerate session and restore data atomically to prevent race conditions
          await new Promise<void>((resolve, reject) => {
            req.session?.regenerate((err) => {
              if (err) return reject(err);

              // Restore session data immediately in callback to ensure CSRF protection works
              if (inviteToken) req.session.inviteToken = inviteToken;
              if (inviteTokenEmail) req.session.inviteTokenEmail = inviteTokenEmail;
              if (inviteTokenIssuedAt) req.session.inviteTokenIssuedAt = inviteTokenIssuedAt;
              if (csrfSecret) req.session.csrfSecret = csrfSecret;

              resolve();
            });
          });

          // Promisify login to ensure proper sequencing
          await new Promise<void>((resolve, reject) => {
            req.login(sessionUser, (loginErr) => {
              if (loginErr) return reject(loginErr);
              resolve();
            });
          });

          req.session.lastActivity = Date.now();

          // Explicitly save session to ensure all data is persisted
          await new Promise<void>((resolve, reject) => {
            req.session.save((saveErr) => {
              if (saveErr) {
                console.error('Session save error:', saveErr);
                return reject(saveErr);
              }
              resolve();
            });
          });

          res.json({
            user: sessionUser,
            isNewUser: signInResult.isNewUser,
            assignedRoles: signInResult.assignedRoles
          });
        } catch (error) {
          console.error('Login error:', error);
          res.status(500).json({ message: "Login failed" });
        }
      }).catch((error) => {
        console.error('Authentication error:', error);
        res.status(500).json({ message: "Internal server error" });
      });
      return;
    } catch (error) {
      console.error('Authentication error:', error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Account linking endpoint
  app.post("/api/auth/link", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const { provider, credentials } = req.body;

      if (!provider || !credentials) {
        return res.status(400).json({ 
          message: "Provider and credentials are required" 
        });
      }

      // Get the authentication provider
      const authProvider = providerRegistry.get(provider);
      if (!authProvider) {
        return res.status(400).json({ 
          message: `Authentication provider '${provider}' not available` 
        });
      }

      // Authenticate with the provider to verify credentials
      const authResult = await authProvider.authenticate(credentials);
      
      if (!authResult.success) {
        return res.status(401).json({ 
          message: authResult.error || "Provider authentication failed" 
        });
      }

      // Check if this external ID is already linked to another user
      const userService = getUserService();
      const existingIdentity = await userService.getUserIdentityByProvider(provider, authResult.user!.externalId);
      if (existingIdentity && existingIdentity.userId !== req.user!.id) {
        return res.status(400).json({ 
          message: "This account is already linked to another user" 
        });
      }

      // Create or update the identity link
      if (existingIdentity) {
        await userService.updateUserIdentity(existingIdentity.id, {
          email: authResult.user!.email,
          username: authResult.user!.username
        });
      } else {
        await userService.createUserIdentity({
          userId: req.user!.id,
          provider,
          externalId: authResult.user!.externalId,
          email: authResult.user!.email,
          username: authResult.user!.username
        });
      }

      res.json({ message: "Account linked successfully" });
    } catch (error) {
      console.error('Account linking error:', error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Public: list available/registered authentication providers for the sign-in screen
  app.get("/api/auth/available-providers", (_req, res) => {
    try {
      const providers = providerRegistry.getEnabledProviders();
      res.json({ providers });
    } catch (error) {
      console.error("Failed to get available providers:", error);
      res.status(500).json({ message: "Failed to load providers" });
    }
  });

  // Provider configuration validation endpoint
  app.get("/api/auth/validation", (req, res) => {
    const validationResults = validateProviderConfigurations();
    const hasErrors = Object.values(validationResults).some(errors => errors.length > 0);
    
    res.json({
      valid: !hasErrors,
      results: validationResults
    });
  });
}
