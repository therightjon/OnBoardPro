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
  }
}

const PostgresSessionStore = connectPg(session);

const scryptAsync = promisify(scrypt);

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

async function comparePasswords(supplied: string, stored: string) {
  try {
    // Check if it's a bcrypt hash (existing format)
    if (stored.startsWith('$2')) {
      return await bcrypt.compare(supplied, stored);
    }
    
    // Handle scrypt format (new format)
    const parts = stored.split(".");
    if (parts.length !== 2) {
      console.error("Invalid stored password format - missing salt or hash");
      return false;
    }
    
    const [hashed, salt] = parts;
    if (!hashed || !salt) {
      console.error("Invalid stored password format - empty hash or salt");
      return false;
    }
    
    const hashedBuf = Buffer.from(hashed, "hex");
    const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
    
    if (hashedBuf.length !== suppliedBuf.length) {
      console.error("Buffer length mismatch in password comparison");
      return false;
    }
    
    return timingSafeEqual(hashedBuf, suppliedBuf);
  } catch (error) {
    console.error("Error comparing passwords:", error);
    return false;
  }
}

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

  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: new PostgresSessionStore({
      pool,
      createTableIfMissing: true
    }),
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
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

  app.post("/api/login", passport.authenticate("local"), async (req, res) => {
    try {
      // Track last login time
      if (req.user && req.user.id) {
        const userService = getUserService();
        await userService.updateLastLogin(req.user.id);
      }
      res.status(200).json(req.user);
    } catch (error) {
      // Don't fail login if last login update fails
      console.error('Failed to update last login:', error);
      res.status(200).json(req.user);
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
      hydrateAuthUser(signInResult.user!).then((sessionUser) => {
        req.login(sessionUser, (err) => {
          if (err) {
            console.error('Login error:', err);
            return res.status(500).json({ message: "Login failed" });
          }
          res.json({
            user: sessionUser,
            isNewUser: signInResult.isNewUser,
            assignedRoles: signInResult.assignedRoles
          });
        });
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
