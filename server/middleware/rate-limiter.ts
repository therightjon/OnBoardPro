import type { RequestHandler } from "express";
import { env } from "../config/env";
import { evaluateRateLimit, incrementRateLimit } from "../services/rate-limit.service";

export type RateLimiterOptions = {
  windowMs: number;
  max: number;
  name: string;
  keyGenerator?: (req: any) => string | null | undefined;
  message?: string;
};

function resolveIp(req: any): string {
  const ip = req.ip || req.headers["x-forwarded-for"] || req.connection?.remoteAddress;
  if (Array.isArray(ip)) return ip[0] ?? "";
  return typeof ip === "string" ? ip : "";
}

export function createRateLimiter(options: RateLimiterOptions): RequestHandler {
  const { windowMs, max, name, keyGenerator, message } = options;

  return async function rateLimiter(req: any, res: any, next: any) {
    const key = keyGenerator ? keyGenerator(req) ?? "" : resolveIp(req);
    if (!key) return next();

    try {
      const rule = { type: `api:${name}`, key, windowMs, max };
      const evaluation = await evaluateRateLimit(rule);
      if (!evaluation.allowed) {
        res.setHeader("Retry-After", String(evaluation.retryAfterSeconds));
        res.setHeader("X-RateLimit-Limit", String(max));
        res.setHeader("X-RateLimit-Remaining", "0");
        res.setHeader("X-RateLimit-Reset", evaluation.resetAt ? String(Math.floor(evaluation.resetAt.getTime() / 1000)) : "");
        return res.status(429).json({ message: message || "Too many requests, please slow down." });
      }

      const { count, resetAt } = await incrementRateLimit(rule);
      const remaining = Math.max(0, max - count);
      res.setHeader("X-RateLimit-Limit", String(max));
      res.setHeader("X-RateLimit-Remaining", String(remaining));
      res.setHeader("X-RateLimit-Reset", resetAt ? String(Math.floor(resetAt.getTime() / 1000)) : "");
      return next();
    } catch (error) {
      console.error(`Rate limiter '${name}' error:`, error);
      return next();
    }
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
  name: "sensitive",
  message: "Too many sensitive requests, please slow down."
});
