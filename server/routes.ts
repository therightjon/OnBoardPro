import type { Express, RequestHandler } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./features/auth/services/auth.service";
import docsRouter from "./routes/docs";
import { defaultRateLimiter } from "./middleware/rate-limiter";
import { Request, Response, NextFunction } from "express";

// Import all modular route files
import referenceDataRouter from "./routes/reference-data.routes";
import searchRouter from "./routes/search.routes";
import notificationsRouter from "./routes/notifications.routes";
import templatesRouter from "./routes/templates.routes";
import tasksRouter from "./routes/tasks.routes";
import candidatesRouter from "./routes/candidates.routes";
import authRouter from "./routes/auth.routes";
import usersRouter from "./routes/users.routes";
import organizationsRouter from "./routes/organizations.routes";
import settingsRouter from "./routes/settings.routes";
import { csrfErrorHandler, csrfProtection } from "./middleware/csrf";
import { sessionIdleTimeout } from "./middleware/session-timeout";

// Re-export for backward compatibility with tests
export { preferencesUpdateSchema } from "./routes/users.routes";
export {
  PREFERENCE_KEYS,
  buildPreferenceResponse,
  filterUpdatesForRole,
  pickPreferencesForRole,
} from "./utils/preferences.utils";

export interface RegisterRoutesOptions {
  skipAuthSetup?: boolean;
  rateLimiters?: Partial<Record<"default" | "sensitive", RequestHandler>>;
}

/**
 * Register all application routes
 *
 * This function sets up authentication and mounts all modular route handlers.
 * Routes are organized by feature domain:
 * - reference-data: Lookup tables (hiring stages, task definitions, etc.)
 * - search: Dashboard and search endpoints
 * - notifications: Notification management
 * - templates: Template CRUD and expansion
 * - tasks: Task management
 * - candidates: Candidate lifecycle management
 * - auth: Authentication, invitations, providers
 * - users: User management and preferences
 * - organizations: Departments and divisions
 * - settings: System and email settings
 *
 * @param app - Express application instance
 * @param options - Configuration options
 * @returns HTTP server instance
 */
export async function registerRoutes(app: Express, options: RegisterRoutesOptions = {}): Promise<Server> {
  // Set up authentication (passport strategies, session, etc.)
  if (!options.skipAuthSetup) {
    await setupAuth(app);
  }

  // Enforce idle timeout on all requests once the session is available
  app.use(sessionIdleTimeout);

  // Global API rate limiting (per-IP) using DB-backed counters
  app.use("/api", defaultRateLimiter);

  // CSRF token endpoint and protection for state-changing API routes
  app.get("/api/csrf-token", csrfProtection, (req, res) => {
    res.json({ csrfToken: req.csrfToken() });
  });

  const csrfExcluded = new Set<string>([
    "/login",
    "/auth/login",
    "/auth/available-providers",
    "/csrf-token"
  ]);

  app.use("/api", (req: Request, res: Response, next: NextFunction) => {
    const path = req.path; // Express strips the mount path (/api) when using app.use("/api", ...)
    if (csrfExcluded.has(path)) {
      return next();
    }
    return csrfProtection(req, res, next);
  });

  // Mount all route modules under /api prefix
  // Order matters for route matching - more specific routes should come first
  
  // Reference data and lookup tables (public-ish, used by many features)
  app.use("/api", referenceDataRouter);
  
  // Search and dashboard
  app.use("/api", searchRouter);
  
  // Authentication and invitations
  app.use("/api", authRouter);
  
  // User management and preferences
  app.use("/api", usersRouter);
  
  // Organizational structure (departments, divisions)
  app.use("/api", organizationsRouter);
  
  // System and email settings
  app.use("/api", settingsRouter);
  
  // Notifications and comments
  app.use("/api", notificationsRouter);
  
  // Templates (CRUD, stages, tasks, expansion)
  app.use("/api", templatesRouter);
  
  // Task management
  app.use("/api", tasksRouter);
  
  // Candidate lifecycle (CRUD, status, followers, stages)
  app.use("/api", candidatesRouter);
  
  // API Documentation
  app.use(docsRouter);

  // Normalize CSRF errors
  app.use(csrfErrorHandler);

  // Create and return HTTP server
  const httpServer = createServer(app);
  return httpServer;
}
