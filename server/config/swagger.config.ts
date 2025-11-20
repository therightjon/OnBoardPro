/**
 * Swagger/OpenAPI Configuration
 *
 * Configures API documentation using OpenAPI 3.0 specification
 */

import swaggerJsdoc from 'swagger-jsdoc';
import { version } from '../../package.json';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'OnBoardPro API',
      version: version,
      description:
        '# OnBoardPro API Documentation\n\n' +
        'OnBoardPro is a comprehensive hiring pipeline management system that helps organizations streamline their candidate onboarding process.\n\n' +
        '## Architecture\n\n' +
        'The API is organized into **four bounded contexts**:\n\n' +
        '### 1. Candidate Management\n' +
        'Manage candidates through the hiring pipeline from application to onboarding.\n' +
        '- Create and update candidates\n' +
        '- Apply workflow templates\n' +
        '- Track stage progression\n' +
        '- Manage candidate followers\n\n' +
        '### 2. Task Management\n' +
        'Manage tasks, assignments, and completion tracking for candidates.\n' +
        '- Create and assign tasks\n' +
        '- Track task status and completion\n' +
        '- Handle task assignments and reassignments\n' +
        '- Query tasks by various filters\n\n' +
        '### 3. Template Management\n' +
        'Define and manage reusable hiring workflow templates.\n' +
        '- Create and manage templates\n' +
        '- Define stages and tasks\n' +
        '- Activate/deactivate templates\n' +
        '- Clone existing templates\n\n' +
        '### 4. User Management\n' +
        'Manage users, authentication, authorization, and preferences.\n' +
        '- User CRUD operations\n' +
        '- Role management\n' +
        '- User preferences\n' +
        '- Authentication and authorization\n\n' +
        '## Authentication\n\n' +
        'The API uses session-based authentication with cookies. Most endpoints require authentication.\n\n' +
        '**Authentication Flow:**\n' +
        '1. POST /api/auth/signin with credentials\n' +
        '2. Server sets httpOnly session cookie\n' +
        '3. Include cookie in subsequent requests\n' +
        '4. POST /api/auth/signout to end session\n\n' +
        '## Authorization\n\n' +
        'Role-based access control (RBAC) with the following roles:\n' +
        '- system_admin - Full system access\n' +
        '- hr_staff - HR operations\n' +
        '- department_admin - Department-level management\n' +
        '- division_leader - Division-level management\n' +
        '- manager - Team manager\n' +
        '- candidate - Self-service candidate access\n\n' +
        '## Rate Limiting\n\n' +
        'Sensitive endpoints are rate-limited to prevent abuse:\n' +
        '- Default: 100 requests per 15 minutes\n' +
        '- Auth endpoints: 5 requests per 15 minutes\n\n' +
        '## Error Responses\n\n' +
        'Standard error response format:\n' +
        '```json\n' +
        '{\n' +
        '  "message": "Error description",\n' +
        '  "errors": []\n' +
        '}\n' +
        '```\n\n' +
        'Common HTTP status codes:\n' +
        '- 200 - Success\n' +
        '- 201 - Created\n' +
        '- 400 - Bad Request (validation error)\n' +
        '- 401 - Unauthorized (not authenticated)\n' +
        '- 403 - Forbidden (insufficient permissions)\n' +
        '- 404 - Not Found\n' +
        '- 429 - Too Many Requests (rate limited)\n' +
        '- 500 - Internal Server Error\n\n' +
        '## Domain Events\n\n' +
        'The system uses an event-driven architecture. Many operations publish domain events:\n' +
        '- candidate.created, candidate.updated, candidate.stage_changed\n' +
        '- task.created, task.assigned, task.completed\n' +
        '- template.created, template.updated, template.activated\n' +
        '- user.created, user.role_changed\n\n' +
        'These events trigger notifications, background jobs, and cross-context integrations.\n\n' +
        '## Pagination\n\n' +
        'List endpoints support pagination via query parameters:\n' +
        '- limit - Number of results per page (default: 20)\n' +
        '- offset - Number of results to skip (default: 0)\n\n' +
        '## Filtering\n\n' +
        'Most list endpoints support filtering via query parameters specific to the resource.\n\n' +
        '## Further Documentation\n\n' +
        '- [Architecture Review](../docs/ARCHITECTURE_REVIEW.md)\n' +
        '- [Bounded Contexts](../docs/BOUNDED_CONTEXTS.md)\n' +
        '- [Service Layer Documentation](../server/services/README.md)',
      contact: {
        name: 'OnBoardPro Development Team',
      },
      license: {
        name: 'Proprietary',
      },
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: 'Development server',
      },
      {
        url: 'http://localhost:5001',
        description: 'Development server (alternate port)',
      },
      {
        url: 'http://localhost:5002',
        description: 'Development server (alternate port)',
      },
    ],
    components: {
      securitySchemes: {
        sessionCookie: {
          type: 'apiKey',
          in: 'cookie',
          name: 'connect.sid',
          description: 'Session cookie set after authentication',
        },
      },
      schemas: {
        // Common schemas
        Error: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'Error message',
            },
            errors: {
              type: 'array',
              description: 'Validation errors (optional)',
              items: {
                type: 'object',
              },
            },
          },
        },

        // Candidate schemas
        Candidate: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Unique identifier',
            },
            firstName: {
              type: 'string',
              description: 'First name',
            },
            lastName: {
              type: 'string',
              description: 'Last name',
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'Email address',
            },
            status: {
              type: 'string',
              enum: ['active', 'archived', 'hired', 'rejected'],
              description: 'Current status',
            },
            currentStageId: {
              type: 'string',
              format: 'uuid',
              description: 'Current hiring stage',
              nullable: true,
            },
            departmentId: {
              type: 'string',
              format: 'uuid',
              description: 'Department assignment',
            },
            primaryOwnerId: {
              type: 'string',
              format: 'uuid',
              description: 'Primary owner (HR staff)',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },

        // Task schemas
        Task: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
            },
            candidateId: {
              type: 'string',
              format: 'uuid',
              description: 'Associated candidate',
            },
            title: {
              type: 'string',
              description: 'Task title',
            },
            status: {
              type: 'string',
              enum: ['pending', 'in_progress', 'done', 'canceled'],
              description: 'Task status',
            },
            assigneeUserId: {
              type: 'string',
              format: 'uuid',
              description: 'Assigned user ID',
              nullable: true,
            },
            dueAt: {
              type: 'string',
              format: 'date-time',
              description: 'Due date',
              nullable: true,
            },
            completedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Completion timestamp',
              nullable: true,
            },
            required: {
              type: 'boolean',
              description: 'Whether task is required for stage advancement',
            },
          },
        },

        // Template schemas
        Template: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
            },
            name: {
              type: 'string',
              description: 'Template name',
            },
            description: {
              type: 'string',
              description: 'Template description',
              nullable: true,
            },
            isActive: {
              type: 'boolean',
              description: 'Whether template is active and available for use',
            },
            candidateTypeId: {
              type: 'string',
              format: 'uuid',
              description: 'Associated candidate type',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },

        // User schemas
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
            },
            email: {
              type: 'string',
              format: 'email',
            },
            firstName: {
              type: 'string',
              nullable: true,
            },
            lastName: {
              type: 'string',
              nullable: true,
            },
            role: {
              type: 'string',
              enum: ['system_admin', 'hr_staff', 'department_admin', 'division_leader', 'manager', 'candidate'],
              description: 'Primary role',
            },
            status: {
              type: 'string',
              enum: ['active', 'inactive', 'archived'],
            },
            departmentId: {
              type: 'string',
              format: 'uuid',
              nullable: true,
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
      },
    },
    security: [
      {
        sessionCookie: [],
      },
    ],
    tags: [
      {
        name: 'Candidate Management',
        description: 'Operations related to managing candidates through the hiring pipeline',
      },
      {
        name: 'Task Management',
        description: 'Operations related to managing tasks and assignments',
      },
      {
        name: 'Template Management',
        description: 'Operations related to managing workflow templates',
      },
      {
        name: 'User Management',
        description: 'Operations related to managing users and permissions',
      },
      {
        name: 'Authentication',
        description: 'Authentication and authorization operations',
      },
      {
        name: 'Reference Data',
        description: 'Operations related to reference data (departments, divisions, stages, etc.)',
      },
    ],
  },
  apis: [
    './server/routes/**/*.ts',
    './server/routes/*.ts',
  ],
};

export const swaggerSpec = swaggerJsdoc(options);
