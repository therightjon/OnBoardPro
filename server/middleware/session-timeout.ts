import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";

declare module "express-session" {
  interface SessionData {
    lastActivity?: number;
    createdAt?: number;
  }
}

const IDLE_TIMEOUT_MS = env.SESSION_IDLE_TIMEOUT_HOURS * 60 * 60 * 1000;
const ABSOLUTE_TIMEOUT_MS = env.SESSION_ABSOLUTE_TIMEOUT_HOURS * 60 * 60 * 1000;

/**
 * Enforces both idle and absolute timeouts on authenticated sessions.
 * 
 * - **Idle timeout** (default 2 hours): Destroys session after inactivity period.
 *   Rolling: `lastActivity` is updated on each request.
 * - **Absolute timeout** (default 24 hours): Destroys session after maximum duration,
 *   regardless of activity. This prevents indefinite session extension via rolling.
 * 
 * Configurable via environment variables:
 * - `SESSION_IDLE_TIMEOUT_HOURS` (default: 2)
 * - `SESSION_ABSOLUTE_TIMEOUT_HOURS` (default: 24)
 */
export function sessionIdleTimeout(req: Request, res: Response, next: NextFunction) {
  const { session } = req;
  if (!session) return next();

  const now = Date.now();

  // Check absolute timeout first (session creation time)
  const createdAt = session.createdAt;
  if (createdAt && now - createdAt > ABSOLUTE_TIMEOUT_MS) {
    return req.session.destroy(() => {
      res.status(401).json({ message: "Session expired. Please log in again." });
    });
  }

  // Check idle timeout (last activity)
  const lastActivity = session.lastActivity;
  if (lastActivity && now - lastActivity > IDLE_TIMEOUT_MS) {
    return req.session.destroy(() => {
      res.status(401).json({ message: "Session expired due to inactivity" });
    });
  }

  // Update last activity timestamp (rolling idle timeout)
  session.lastActivity = now;
  return next();
}
