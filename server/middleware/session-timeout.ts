import type { NextFunction, Request, Response } from "express";

declare module "express-session" {
  interface SessionData {
    lastActivity?: number;
  }
}

const IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours

/**
 * Enforces an idle timeout on authenticated sessions.
 * Destroys the session after 2 hours of inactivity and rolls the timestamp on each request.
 */
export function sessionIdleTimeout(req: Request, res: Response, next: NextFunction) {
  const { session } = req;
  if (!session) return next();

  const now = Date.now();
  const lastActivity = session.lastActivity;

  if (lastActivity && now - lastActivity > IDLE_TIMEOUT_MS) {
    return req.session.destroy(() => {
      res.status(401).json({ message: "Session expired due to inactivity" });
    });
  }

  session.lastActivity = now;
  return next();
}
