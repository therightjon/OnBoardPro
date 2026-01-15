import type { NextFunction, Request, Response } from "express";
import { getCachedSecuritySettings } from "../services/settings/system-settings.service";

declare module "express-session" {
  interface SessionData {
    lastActivity?: number;
    createdAt?: number;
  }
}

/**
 * Enforces both idle and absolute timeouts on authenticated sessions.
 * 
 * - **Idle timeout** (default 2 hours): Destroys session after inactivity period.
 *   Rolling: `lastActivity` is updated on each request.
 * - **Absolute timeout** (default 24 hours): Destroys session after maximum duration,
 *   regardless of activity. This prevents indefinite session extension via rolling.
 * 
 * Timeouts are configurable via:
 * 1. Database settings (Settings > Security, system_admin only) - checked on each request
 * 2. Environment variables (fallback defaults):
 *    - `SESSION_IDLE_TIMEOUT_HOURS` (default: 2)
 *    - `SESSION_ABSOLUTE_TIMEOUT_HOURS` (default: 24)
 */
export function sessionIdleTimeout(req: Request, res: Response, next: NextFunction) {
  const { session } = req;
  if (!session) return next();

  const now = Date.now();
  
  // Get current timeout settings (cached, refreshes every minute)
  const settings = getCachedSecuritySettings();
  const idleTimeoutMs = settings.session_idle_timeout_hours * 60 * 60 * 1000;
  const absoluteTimeoutMs = settings.session_absolute_timeout_hours * 60 * 60 * 1000;

  // Check absolute timeout first (session creation time)
  const createdAt = session.createdAt;
  if (createdAt && now - createdAt > absoluteTimeoutMs) {
    return req.session.destroy(() => {
      res.status(401).json({ message: "Session expired. Please log in again." });
    });
  }

  // Check idle timeout (last activity)
  const lastActivity = session.lastActivity;
  if (lastActivity && now - lastActivity > idleTimeoutMs) {
    return req.session.destroy(() => {
      res.status(401).json({ message: "Session expired due to inactivity" });
    });
  }

  // Update last activity timestamp (rolling idle timeout)
  session.lastActivity = now;
  return next();
}
