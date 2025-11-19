import { Router } from "express";
import { db } from "../db/connection";
import { sql } from "drizzle-orm";

const router = Router();

/**
 * Comprehensive health check endpoint
 * Returns status of all system components
 */
router.get("/health", async (req, res) => {
  const checks: Record<string, string> = {};
  let isHealthy = true;

  // Check database connectivity
  try {
    const start = Date.now();
    await db.execute(sql`SELECT 1`);
    const duration = Date.now() - start;
    checks.database = `up (${duration}ms)`;
  } catch (error) {
    checks.database = `down (${error instanceof Error ? error.message : 'unknown error'})`;
    isHealthy = false;
  }

  // Check server status
  checks.server = "up";

  // Check memory usage
  const memUsage = process.memoryUsage();
  checks.memory = `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB / ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`;

  // Check uptime
  checks.uptime = `${Math.floor(process.uptime())}s`;

  const response = {
    status: isHealthy ? "healthy" : "unhealthy",
    timestamp: new Date().toISOString(),
    checks,
    version: process.env.npm_package_version || "unknown"
  };

  res.status(isHealthy ? 200 : 503).json(response);
});

/**
 * Kubernetes readiness probe
 * Returns 200 if the app is ready to receive traffic
 */
router.get("/health/ready", async (req, res) => {
  try {
    // Check database connectivity
    await db.execute(sql`SELECT 1`);
    res.status(200).send("OK");
  } catch (error) {
    console.error("Readiness check failed:", error);
    res.status(503).send("Not Ready");
  }
});

/**
 * Kubernetes liveness probe
 * Returns 200 if the app is running (even if degraded)
 */
router.get("/health/live", (req, res) => {
  // Basic liveness check - if we can respond, we're alive
  res.status(200).send("OK");
});

/**
 * Simple ping endpoint
 */
router.get("/ping", (req, res) => {
  res.send("pong");
});

export default router;
