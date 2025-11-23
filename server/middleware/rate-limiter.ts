import type { RequestHandler } from "express";
import { env } from "../config/env";

export type RateLimiterOptions = {
  windowMs: number;
  max: number;
  name: string;
  keyGenerator?: (req: any) => string | null | undefined;
};

export function createRateLimiter(options: RateLimiterOptions): RequestHandler {
  const { windowMs, max, name, keyGenerator } = options;
  const buckets = new Map<string, { count: number; reset: number }>();

  const resolveKey = (req: any) => {
    if (keyGenerator) return keyGenerator(req) ?? "";
    const ip = req.ip || req.headers["x-forwarded-for"] || req.connection?.remoteAddress;
    if (Array.isArray(ip)) return ip[0] ?? "";
    return typeof ip === "string" ? ip : "";
  };

  return async function rateLimiter(req: any, res: any, next: any) {
    const key = resolveKey(req);
    if (!key) {
      return next();
    }

    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || now >= bucket.reset) {
      buckets.set(key, { count: 1, reset: now + windowMs });
      res.setHeader("X-RateLimit-Limit", String(max));
      res.setHeader("X-RateLimit-Remaining", String(max - 1));
      res.setHeader("X-RateLimit-Reset", String(Math.floor((now + windowMs) / 1000)));
      return next();
    }

    if (bucket.count >= max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.reset - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.setHeader("X-RateLimit-Limit", String(max));
      res.setHeader("X-RateLimit-Remaining", "0");
      res.setHeader("X-RateLimit-Reset", String(Math.floor(bucket.reset / 1000)));

      // Log rate limit exceeded
      try {
        const { reportAuthorizationFailure } = await import("../observability/authMetrics");
        reportAuthorizationFailure({
          actorId: (req as any).user?.id || 'anonymous',
          roles: (req as any).user?.roles || [],
          resource: "general",
          action: `rate_limit:${name}`,
          reason: `exceeded_${max}`,
          timestamp: new Date()
        });
      } catch {
        // ignore metrics errors
      }

      return res.status(429).json({ message: "Too many requests, please slow down." });
    }

    bucket.count += 1;
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - bucket.count)));
    res.setHeader("X-RateLimit-Reset", String(Math.floor(bucket.reset / 1000)));
    next();
  };
}

// Pre-configured rate limiters
export const defaultRateLimiter = createRateLimiter({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  name: "default"
});

export const sensitiveRateLimiter = createRateLimiter({
  windowMs: env.SENSITIVE_RATE_LIMIT_WINDOW_MS || env.RATE_LIMIT_WINDOW_MS,
  max: env.SENSITIVE_RATE_LIMIT_MAX,
  name: "sensitive"
});
