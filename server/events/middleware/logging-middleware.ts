/**
 * Logging Middleware
 *
 * Logs all domain events for debugging and auditing
 */

import type { EventMiddleware } from "../event-types";

/**
 * Create logging middleware
 * @param options - Logging options
 */
export function createLoggingMiddleware(options: {
  /** Whether to log events (default: true in development, false in production) */
  enabled?: boolean;
  /** Log level (default: "info") */
  level?: "debug" | "info" | "warn";
  /** Whether to log event payload (default: false for privacy) */
  logPayload?: boolean;
}= {}): EventMiddleware {
  const enabled = options.enabled ?? process.env.NODE_ENV === "development";
  const level = options.level ?? "info";
  const logPayload = options.logPayload ?? false;

  return async (event, next) => {
    if (!enabled) {
      return next();
    }

    const startTime = Date.now();

    const logData: Record<string, any> = {
      eventId: event.id,
      eventType: event.type,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      actorId: event.actorId,
      timestamp: event.timestamp.toISOString(),
      correlationId: event.correlationId,
      causationId: event.causationId
    };

    if (logPayload) {
      logData.payload = event.payload;
    }

    if (level === "debug") {
      console.debug("[EVENT]", logData);
    } else if (level === "info") {
      console.info(`[EVENT] ${event.type}`, {
        id: event.id,
        aggregateId: event.aggregateId,
        actorId: event.actorId
      });
    }

    try {
      await next();

      const duration = Date.now() - startTime;
      if (level === "debug") {
        console.debug(`[EVENT PROCESSED] ${event.type} in ${duration}ms`);
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[EVENT ERROR] ${event.type} failed after ${duration}ms`, {
        eventId: event.id,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  };
}
