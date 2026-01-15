import { evaluateRateLimit, incrementRateLimit, resetRateLimit } from "./rate-limit.service";

const USER_WINDOW_MS = 15 * 60 * 1000;
const USER_MAX = 5;
const IP_WINDOW_MS = 15 * 60 * 1000;
const IP_MAX = 30;

// Skip rate limiting in test mode to avoid database dependencies and test isolation issues
const isTestMode = process.env.NODE_ENV === "test" || process.env.SKIP_AUTH_SETUP === "1";

export interface LoginLimiterCheck {
  allowed: boolean;
  status: number;
  message?: string;
  retryAfterSeconds?: number;
}

function normalizeIdentifier(value?: string | null): string | null {
  if (!value) return null;
  return value.trim().toLowerCase();
}

export async function checkLoginLimits(params: { identifier?: string | null; ip?: string | null }): Promise<LoginLimiterCheck> {
  // In test mode, always allow login attempts
  if (isTestMode) {
    return { allowed: true, status: 200 };
  }

  const identifier = normalizeIdentifier(params.identifier ?? null);
  const ip = params.ip?.trim() || null;

  // Check per-user lockout first
  if (identifier) {
    const userEval = await evaluateRateLimit({
      type: "login:user",
      key: identifier,
      windowMs: USER_WINDOW_MS,
      max: USER_MAX
    });
    if (!userEval.allowed) {
      return {
        allowed: false,
        status: 429,
        message: "Too many failed attempts. Try again in 15 minutes.",
        retryAfterSeconds: userEval.retryAfterSeconds
      };
    }
  }

  // Then check per-IP throttling
  if (ip) {
    const ipEval = await evaluateRateLimit({
      type: "login:ip",
      key: ip,
      windowMs: IP_WINDOW_MS,
      max: IP_MAX
    });
    if (!ipEval.allowed) {
      return {
        allowed: false,
        status: 429,
        message: "Too many login attempts from this IP. Please slow down.",
        retryAfterSeconds: ipEval.retryAfterSeconds
      };
    }
  }

  return { allowed: true, status: 200 };
}

export async function recordLoginFailure(params: { identifier?: string | null; ip?: string | null }): Promise<void> {
  // In test mode, skip recording login failures
  if (isTestMode) {
    return;
  }

  const identifier = normalizeIdentifier(params.identifier ?? null);
  const ip = params.ip?.trim() || null;

  const tasks: Promise<any>[] = [];
  if (identifier) {
    tasks.push(
      incrementRateLimit({
        type: "login:user",
        key: identifier,
        windowMs: USER_WINDOW_MS,
        max: USER_MAX
      })
    );
  }
  if (ip) {
    tasks.push(
      incrementRateLimit({
        type: "login:ip",
        key: ip,
        windowMs: IP_WINDOW_MS,
        max: IP_MAX
      })
    );
  }
  await Promise.allSettled(tasks);
}

export async function resetLoginLimit(params: { identifier?: string | null; ip?: string | null }): Promise<void> {
  // In test mode, skip resetting login limits
  if (isTestMode) {
    return;
  }

  const identifier = normalizeIdentifier(params.identifier ?? null);
  const ip = params.ip?.trim() || null;

  const tasks: Promise<any>[] = [];
  if (identifier) {
    tasks.push(resetRateLimit("login:user", identifier));
  }
  if (ip) {
    tasks.push(resetRateLimit("login:ip", ip));
  }
  await Promise.allSettled(tasks);
}
