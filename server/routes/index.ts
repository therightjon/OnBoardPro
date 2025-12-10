/**
 * Routes Index - Central Router Aggregator
 *
 * This module aggregates all feature-based route modules and provides
 * a single registration point for the Express application.
 *
 * Route modules are organized by feature:
 * - reference-data: Lookup tables and reference data (11 routes)
 * - organizations: Departments and divisions (10 routes)
 * - settings: System and email settings (5 routes)
 * - search: Search and dashboard endpoints (4 routes)
 * - users: User management and preferences (12 routes)
 * - auth: Authentication and invitations (7 routes)
 * - notifications: Notifications and comments (5 routes)
 * - templates: Template management (18 routes)
 * - tasks: Task management (9 routes)
 * - candidates: Candidate management (14 routes)
 *
 * Total: 95 routes across 10 modules
 */

import type { Express } from "express";
import { Router } from "express";

// Import all route modules
import referenceDataRouter from "./reference-data.routes";
import organizationsRouter from "./organizations.routes";
import settingsRouter from "./settings.routes";
import searchRouter from "./search.routes";
import usersRouter from "./users.routes";
import authRouter from "./auth.routes";
import notificationsRouter from "./notifications.routes";
import auditRouter from "./audit.routes";
import templatesRouter from "./templates.routes";
import tasksRouter from "./tasks.routes";
import candidatesRouter from "./candidates.routes";

/**
 * Register all application routes
 *
 * Routes are registered in this order:
 * 1. Reference data (non-authenticated lookups)
 * 2. Search and dashboard (authenticated queries)
 * 3. Authentication and invitations
 * 4. User management
 * 5. Organizational structure
 * 6. Settings
 * 7. Core entities (candidates, templates, tasks)
 * 8. Notifications and comments
 *
 * All routes are prefixed with /api
 *
 * @param app - Express application instance
 */
export function registerRoutes(app: Express): void {
  // Reference data and lookup tables
  app.use("/api", referenceDataRouter);

  // Search and dashboard
  app.use("/api", searchRouter);

  // Authentication and invitations
  app.use("/api", authRouter);

  // User management
  app.use("/api", usersRouter);

  // Organizational structure
  app.use("/api", organizationsRouter);

  // System and email settings
  app.use("/api", settingsRouter);

  // Core entities - order matters for dependency resolution
  app.use("/api", templatesRouter);     // Templates must be before candidates (template application)
  app.use("/api", candidatesRouter);    // Candidates must be before tasks (task creation)
  app.use("/api", tasksRouter);

  // Notifications and comments (used by all entities)
  app.use("/api", notificationsRouter);
  // Audit log (privileged)
  app.use("/api", auditRouter);
}

/**
 * Create a combined router with all routes
 * Alternative to registerRoutes if you prefer a single router
 *
 * @returns Express router with all routes registered
 */
export function createCombinedRouter(): Router {
  const router = Router();

  router.use(referenceDataRouter);
  router.use(searchRouter);
  router.use(authRouter);
  router.use(usersRouter);
  router.use(organizationsRouter);
  router.use(settingsRouter);
  router.use(templatesRouter);
  router.use(candidatesRouter);
  router.use(tasksRouter);
  router.use(notificationsRouter);
  router.use(auditRouter);

  return router;
}

// Export individual routers for testing or selective use
export {
  referenceDataRouter,
  organizationsRouter,
  settingsRouter,
  searchRouter,
  usersRouter,
  authRouter,
  notificationsRouter,
  templatesRouter,
  tasksRouter,
  candidatesRouter
};

// Default export is the registration function
export default registerRoutes;
