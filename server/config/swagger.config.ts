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
      description: `
# OnBoardPro API Documentation

OnBoardPro is a comprehensive hiring pipeline management system that helps organizations streamline their candidate onboarding process.

## Architecture

The API is organized into **four bounded contexts**:

### 1. Candidate Management
Manage candidates through the hiring pipeline from application to onboarding.
- Create and update candidates
- Apply workflow templates
- Track stage progression
- Manage candidate followers

### 2. Task Management
Manage tasks, assignments, and completion tracking for candidates.
- Create and assign tasks
- Track task status and completion
- Handle task assignments and reassignments
- Query tasks by various filters

### 3. Template Management
Define and manage reusable hiring workflow templates.
- Create and manage templates
- Define stages and tasks
- Activate/deactivate templates
- Clone existing templates

### 4. User Management
Manage users, authentication, authorization, and preferences.
- User CRUD operations
- Role management
- User preferences
- Authentication and authorization

## Authentication

The API uses session-based authentication with cookies. Most endpoints require authentication.

**Authentication Flow:**
1. POST `/api/auth/signin` with credentials
2. Server sets httpOnly session cookie
3. Include cookie in subsequent requests
4. POST `/api/auth/signout` to end session

## Authorization

Role-based access control (RBAC) with the following roles:
- \`system_admin\` - Full system access
- \`hr_staff\` - HR operations
- \`department_admin\` - Department-level management
- \`division_leader\` - Division-level management
- \`manager\` - Team manager
- \`candidate\` - Self-service candidate access

## Rate Limiting

Sensitive endpoints are rate-limited to prevent abuse:
- Default: 100 requests per 15 minutes
- Auth endpoints: 5 requests per 15 minutes

## Error Responses

Standard error response format:
\`\`\`json
{
  "message": "Error description",
  "errors": [] // Optional validation errors
}
\`\`\`

Common HTTP status codes:
- \`200\` - Success
- \`201\` - Created
- \`400\` - Bad Request (validation error)
- \`401\` - Unauthorized (not authenticated)
- \`403\` - Forbidden (insufficient permissions)
- \`404\` - Not Found
- \`429\` - Too Many Requests (rate limited)
- \`500\` - Internal Server Error

## Domain Events

The system uses an event-driven architecture. Many operations publish domain events:
- \`candidate.created\`, \`candidate.updated\`, \`candidate.stage_changed\`
- \`task.created\`, \`task.assigned\`, \`task.completed\`
- \`template.created\`, \`template.updated\`, \`template.activated\`
- \`user.created\`, \`user.role_changed\`

These events trigger notifications, background jobs, and cross-context integrations.

## Pagination

List endpoints support pagination via query parameters:
- \`limit\` - Number of results per page (default: 20)
- \`offset\` - Number of results to skip (default: 0)

## Filtering

Most list endpoints support filtering via query parameters specific to the resource.

## Further Documentation

- [Architecture Review](../docs/ARCHITECTURE_REVIEW.md)
- [Bounded Contexts](../docs/BOUNDED_CONTEXTS.md)
- [Service Layer Documentation](../server/services/README.md)
      `,
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
