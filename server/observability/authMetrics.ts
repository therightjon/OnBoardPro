import { logger } from "../utils/logger";

export type AuthorizationFailureEvent = {
  resource: string;
  action: string;
  reason: string;
  actorId: string | null;
  path?: string;
  method?: string;
  roles: string[];
  candidateId?: string | null;
  taskId?: string | null;
  timestamp: Date;
};

export type AuthorizationMetricsReporter = (event: AuthorizationFailureEvent) => void;

function stdoutReporter(event: AuthorizationFailureEvent): void {
  if (process.env.AUTH_METRICS_STDOUT === "1") {
    const { resource, action, reason, actorId, path, method } = event;
    const payload = {
      resource,
      action,
      reason,
      actorId,
      path,
      method,
      roles: event.roles,
      candidateId: event.candidateId,
      taskId: event.taskId,
      timestamp: event.timestamp.toISOString()
    };
    logger.info('[auth-denied]', payload);
  }
}

let reporter: AuthorizationMetricsReporter = stdoutReporter;

export function setAuthorizationMetricsReporter(next: AuthorizationMetricsReporter): void {
  reporter = next;
}

export function getAuthorizationMetricsReporter(): AuthorizationMetricsReporter {
  return reporter;
}

export function reportAuthorizationFailure(event: AuthorizationFailureEvent): void {
  try {
    reporter(event);
  } catch (error) {
    console.error("Failed to report authorization metrics", error);
  }
}
