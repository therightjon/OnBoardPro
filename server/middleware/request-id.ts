import { randomUUID } from "crypto";
import type { RequestHandler } from "express";

/**
 * Middleware to add/request correlation + request IDs.
 * Reuses inbound X-Correlation-ID/X-Request-ID when provided; otherwise generates a new UUID.
 * Keeps the codebase consistent by setting both req.id and req.correlationId and echoing them in headers.
 */
export const requestIdMiddleware: RequestHandler = (req: any, res, next) => {
  const inbound =
    req.get?.("x-correlation-id") ||
    req.get?.("x-request-id");

  const correlationId = inbound || randomUUID();
  req.correlationId = correlationId;

  // For backward compatibility, also set req.id (used throughout the codebase)
  req.id = req.id || correlationId;

  res.setHeader("X-Correlation-ID", correlationId);
  res.setHeader("X-Request-ID", req.id);

  next();
};

/**
 * Get request ID from request object (alias for correlation ID when present)
 */
export function getRequestId(req: any): string {
  return req?.id || req?.correlationId || "unknown";
}

export function getCorrelationId(req: any): string {
  return req?.correlationId || req?.id || "unknown";
}
