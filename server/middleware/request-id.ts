import { randomUUID } from "crypto";
import type { RequestHandler } from "express";

/**
 * Middleware to add unique request ID to each request
 * This enables request tracing across logs and services
 */
export const requestIdMiddleware: RequestHandler = (req: any, res, next) => {
  // Generate unique request ID
  req.id = randomUUID();

  // Add to response headers for client-side debugging
  res.setHeader("X-Request-ID", req.id);

  next();
};

/**
 * Get request ID from request object
 */
export function getRequestId(req: any): string {
  return req.id || "unknown";
}
