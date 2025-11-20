import { Router } from 'express';
import * as swaggerUi from 'swagger-ui-express';
import { openApiSpec } from '../docs/openapi-spec';

const router = Router();

// Serve OpenAPI specification as JSON
router.get('/api/docs/spec.json', (req, res) => {
  res.json(openApiSpec);
});

// Serve Swagger UI
router.use(
  '/api/docs',
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
