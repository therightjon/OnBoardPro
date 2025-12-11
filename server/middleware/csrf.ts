import type { Request, Response, NextFunction } from "express";
import csrf from "csurf";

// Session-based CSRF protection (no separate cookie)
export const csrfProtection = csrf({ cookie: false });

// Normalize CSRF errors to a consistent JSON response
export function csrfErrorHandler(err: any, _req: Request, res: Response, next: NextFunction) {
  if (err && err.code === "EBADCSRFTOKEN") {
    return res.status(403).json({ message: "Invalid CSRF token" });
  }
  return next(err);
}
