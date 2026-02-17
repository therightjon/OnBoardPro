import type { NextFunction, Request, RequestHandler, Response } from "express";
import Tokens from "csrf";

declare global {
  namespace Express {
    interface Request {
      csrfToken: () => string;
    }
  }
}

type CsrfError = Error & {
  code?: string;
  status?: number;
  statusCode?: number;
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const HEADER_TOKEN_KEYS = [
  "csrf-token",
  "xsrf-token",
  "x-csrf-token",
  "x-xsrf-token",
] as const;

const tokens = new Tokens();

function pickString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === "string") return entry;
    }
  }
  return undefined;
}

function getRequestToken(req: Request): string | undefined {
  const bodyToken = pickString((req.body as any)?._csrf);
  if (bodyToken) return bodyToken;

  const queryToken = pickString((req.query as any)?._csrf);
  if (queryToken) return queryToken;

  for (const key of HEADER_TOKEN_KEYS) {
    const headerToken = pickString(req.headers[key]);
    if (headerToken) return headerToken;
  }

  return undefined;
}

function getOrCreateCsrfSecret(req: Request): string {
  if (!req.session) {
    throw new Error("Session is required for CSRF protection");
  }
  if (!req.session.csrfSecret) {
    req.session.csrfSecret = tokens.secretSync();
  }
  return req.session.csrfSecret;
}

function createInvalidCsrfError(): CsrfError {
  const error = new Error("invalid csrf token") as CsrfError;
  error.code = "EBADCSRFTOKEN";
  error.status = 403;
  error.statusCode = 403;
  return error;
}

// Session-based CSRF protection (no separate cookie)
export const csrfProtection: RequestHandler = (req, _res, next) => {
  req.csrfToken = () => tokens.create(getOrCreateCsrfSecret(req));

  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    return next();
  }

  const secret = req.session?.csrfSecret;
  const token = getRequestToken(req);
  if (!secret || !token || !tokens.verify(secret, token)) {
    return next(createInvalidCsrfError());
  }

  return next();
};

// Normalize CSRF errors to a consistent JSON response
export function csrfErrorHandler(err: any, _req: Request, res: Response, next: NextFunction) {
  if (err && err.code === "EBADCSRFTOKEN") {
    return res.status(403).json({ message: "Invalid CSRF token" });
  }
  return next(err);
}
