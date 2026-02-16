import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import compression from "compression";
import { env } from "./config/env"; // Validate environment early
import { registerRoutes } from "./routes";
import { startDeadlineScanner } from "./jobs/scan-deadlines";
import { startNotificationEmailJobs } from "./jobs/notification-email";
import { startNotificationCleanupJob } from "./jobs/notification-cleanup";
import "./config/database.config"; // initialize DB side-effects
import { setupVite, serveStatic, log } from "./vite";
import { requestIdMiddleware, getRequestId } from "./middleware/request-id";
import { errorHandler } from "./utils/error-handler";
import healthRouter from "./routes/health";
import { eventBus, registerNotificationHandlers, createLoggingMiddleware } from "./events";

const app = express();
const isDevelopment = app.get("env") === "development";

// Security headers (must be early in middleware chain)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      styleSrcElem: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      scriptSrc: isDevelopment
        ? ["'self'", "'unsafe-inline'", "'unsafe-eval'"]
        : ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: isDevelopment
        ? ["'self'", "ws:", "wss:", "https://fonts.googleapis.com", "https://fonts.gstatic.com"]
        : ["'self'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      ...(isDevelopment ? { upgradeInsecureRequests: null } : {})
    }
  }
}));

// Response compression
app.use(compression());

// Request ID tracking
app.use(requestIdMiddleware);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Request logging middleware
app.use((req: any, res, next) => {
  const start = Date.now();
  const path = req.path;
  const requestId = getRequestId(req);

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      const logLine = `[${requestId}] ${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      log(logLine);
    }
  });

  next();
});

(async () => {
  // Health check routes (before auth middleware)
  app.use(healthRouter);

  // Initialize event system
  eventBus.use(createLoggingMiddleware({
    enabled: env.NODE_ENV === "development",
    level: "info",
    logPayload: false // Don't log payloads for privacy
  }));
  registerNotificationHandlers(eventBus);
  log('✓ Event system initialized');

  // Register main application routes
  const server = await registerRoutes(app);

  // Start background jobs (if not disabled)
  if (env.DISABLE_DEADLINE_SCANNER !== '1') {
    startDeadlineScanner();
    log('✓ Deadline scanner started');
  }
  if (env.DISABLE_EMAIL_JOBS !== '1') {
    startNotificationEmailJobs();
    log('✓ Email notification jobs started');
  }
  if (env.DISABLE_NOTIFICATION_CLEANUP !== '1') {
    startNotificationCleanupJob();
    log('✓ Notification cleanup job started');
  }

  // Global error handler (must be last)
  app.use(errorHandler);

  // Enable strong ETags for caching
  app.set('etag', 'strong');

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const requestedPort = env.PORT;
  const maxAttempts = 10;

  function tryListen(port: number, attempt: number) {
    try {
      const srv = server.listen({ port, host: "0.0.0.0" }, () => {
        if (port !== requestedPort) {
          log(`serving on fallback port ${port} (requested ${requestedPort} was busy)`);
        } else {
          log(`serving on port ${port}`);
        }
      });

      srv.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE' && attempt < maxAttempts) {
          const nextPort = port + 1;
          log(`port ${port} in use, trying ${nextPort}...`);
          srv.close(() => {
            setTimeout(() => tryListen(nextPort, attempt + 1), 100);
          });
        } else {
          console.error('Failed to bind port:', err);
          process.exit(1);
        }
      });
    } catch (err: any) {
      if (err.code === 'ERR_SERVER_ALREADY_LISTEN') {
        log(`Server already listening, skipping port ${port}`);
      } else {
        throw err;
      }
    }
  }

  tryListen(requestedPort, 1);
})();
