import { Router, Request, Response, NextFunction } from 'express';
import * as swaggerUi from 'swagger-ui-express';
import { openApiSpec } from '../docs/openapi-spec';
import { env } from '../config/env';

const router = Router();

/**
 * Middleware to require authentication for API documentation.
 * In development mode, docs are accessible without auth for convenience.
 * In production, docs require authentication to prevent API structure disclosure.
 */
function requireDocsAuth(req: Request, res: Response, next: NextFunction): void {
  // Allow unauthenticated access in development for convenience
  if (env.NODE_ENV === 'development') {
    return next();
  }
  
  // In production, require authentication
  if (!req.isAuthenticated?.()) {
    res.status(401).json({ message: 'Authentication required to view API documentation' });
    return;
  }
  
  next();
}

// Serve OpenAPI specification as JSON (both endpoints for backward compatibility)
router.get('/api/docs.json', requireDocsAuth, (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json(openApiSpec);
});

router.get('/api/docs/spec.json', requireDocsAuth, (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json(openApiSpec);
});

// Serve Swagger UI
router.use(
  '/api/docs',
  requireDocsAuth,
  swaggerUi.serve,
  swaggerUi.setup(openApiSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'OnBoardPro API Documentation',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      tryItOutEnabled: true
    }
  })
);

export default router;
