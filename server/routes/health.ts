import { Router } from "express";
import { db } from "../db/connection";
import { sql } from "drizzle-orm";

const router = Router();

/**
 * Comprehensive health check endpoint
 * Returns status of all system components
 * 
 * This endpoint returns detailed system information and is protected
 * to prevent information disclosure. Unauthenticated requests receive
 * only basic status; authenticated admin users get full details.
 */
router.get("/health", async (req, res) => {
  // Check if user is authenticated and has admin privileges
  const isAuthenticated = req.isAuthenticated?.() ?? false;
  const userRoles: string[] = isAuthenticated && req.user 
    ? (Array.isArray((req.user as any).roles) ? (req.user as any).roles : [(req.user as any).role]) 
    : [];
  const isAdmin = userRoles.some(role => role === 'system_admin' || role === 'hr_staff');
  
  let isHealthy = true;

  // Check database connectivity
  try {
    const start = Date.now();
    await db.execute(sql`SELECT 1`);
    const duration = Date.now() - start;
    
    // Only include timing for admin users
    if (isAdmin) {
      // For admin users, return full details
      const checks: Record<string, string> = {};
      checks.database = `up (${duration}ms)`;
      checks.server = "up";
      
      const memUsage = process.memoryUsage();
      checks.memory = `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB / ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`;
      checks.uptime = `${Math.floor(process.uptime())}s`;
      
      return res.status(200).json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        checks,
        version: process.env.npm_package_version || "unknown"
      });
    }
    
    // For non-admin users, return minimal status
    return res.status(200).json({
      status: "healthy",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    isHealthy = false;
    
    if (isAdmin) {
      const checks: Record<string, string> = {};
      checks.database = `down (${error instanceof Error ? error.message : 'unknown error'})`;
      checks.server = "up";
      
      return res.status(503).json({
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        checks
      });
    }
    
    // Non-admin users get minimal error response
    return res.status(503).json({
      status: "unhealthy",
      timestamp: new Date().toISOString()
    });
  }
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
