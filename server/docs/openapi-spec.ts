import type { OpenAPIV3 } from 'openapi-types';

export const openApiSpec: OpenAPIV3.Document = {
  openapi: '3.0.0',
  info: {
    title: 'OnBoardPro API Documentation',
    version: '1.0.0',
    description: 
    'Complete API documentation for the OnBoardPro hiring pipeline management system\n\n' +
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
      '- [Architecture Overview](../docs/ARCHITECTURE.md)\n' +
      '- [Bounded Contexts](../docs/BOUNDED_CONTEXTS.md)\n',
    contact: {
      name: 'OnBoardPro Team',
      email: 'jesteen@uabmc.edu'
    }
  },
  servers: [
    {
      url: 'http://localhost:5000',
      description: 'Development server'
    },
    {
      url: 'http://localhost:5001',
      description: 'Development server (alternate port)'
    }
  ],
  tags: [
    {
      name: 'Candidate Management',
      description: 'Operations related to managing candidates through the hiring pipeline'
    },
    {
      name: 'Task Management',
      description: 'Operations related to managing tasks and assignments'
    },
    {
      name: 'Template Management',
      description: 'Operations related to managing workflow templates'
    },
    {
      name: 'User Management',
      description: 'Operations related to managing users and permissions'
    },
    {
      name: 'Authentication',
      description: 'Authentication and authorization operations'
    },
    {
      name: 'Reference Data',
      description: 'Operations related to reference data (departments, divisions, stages, etc.)'
    },
    {
      name: 'Notifications',
      description: 'Operations for managing user notifications'
    },
    {
      name: 'System Settings',
      description: 'System-wide configuration and settings'
    }
  ],
  components: {
    securitySchemes: {
      sessionCookie: {
        type: 'apiKey',
        in: 'cookie',
        name: 'connect.sid',
        description: 'Session cookie obtained from login'
      }
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: false
          },
          error: {
            type: 'object',
            properties: {
              code: {
                type: 'string',
                example: 'VALIDATION_ERROR'
              },
              message: {
                type: 'string',
                example: 'Validation failed'
              },
              requestId: {
                type: 'string',
                format: 'uuid',
                example: 'a7b3c9d1-e5f8-4a2b-9c3d-1e2f3a4b5c6d'
              },
              details: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    field: { type: 'string' },
                    message: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      },
      Candidate: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
            description: 'Unique candidate identifier'
          },
          salutation: {
            type: 'string',
            nullable: true,
            example: 'Mr.'
          },
          firstName: {
            type: 'string',
            example: 'John'
          },
          lastName: {
            type: 'string',
            example: 'Doe'
          },
          email: {
            type: 'string',
            format: 'email',
            example: 'john.doe@example.com'
          },
          departmentId: {
            type: 'string',
            format: 'uuid'
          },
          divisionId: {
            type: 'string',
            format: 'uuid',
            nullable: true
          },
          managerId: {
            type: 'string',
            format: 'uuid',
            nullable: true
          },
          candidateTypeId: {
            type: 'string',
            format: 'uuid'
          },
          facultyRankId: {
            type: 'string',
            format: 'uuid',
            nullable: true
          },
          status: {
            type: 'string',
            enum: ['draft', 'active', 'on_hold', 'completed', 'canceled', 'archived'],
            example: 'active'
          },
          currentStageId: {
            type: 'string',
            format: 'uuid',
            nullable: true
          },
          templateAppliedFromId: {
            type: 'string',
            format: 'uuid',
            nullable: true
          },
          offerLetterIssuedAt: {
            type: 'string',
            format: 'date-time',
            nullable: true
          },
          offerLetterAcceptedAt: {
            type: 'string',
            format: 'date-time',
            nullable: true
          },
          anticipatedStartDate: {
            type: 'string',
            format: 'date',
            nullable: true
          },
          createdAt: {
            type: 'string',
            format: 'date-time'
          },
          updatedAt: {
            type: 'string',
            format: 'date-time'
          }
        },
        required: ['id', 'firstName', 'lastName', 'email', 'departmentId', 'candidateTypeId', 'status']
      },
      CandidateInput: {
        type: 'object',
        properties: {
          salutation: {
            type: 'string',
            example: 'Mr.'
          },
          firstName: {
            type: 'string',
            example: 'John'
          },
          lastName: {
            type: 'string',
            example: 'Doe'
          },
          email: {
            type: 'string',
            format: 'email',
            example: 'john.doe@example.com'
          },
          departmentId: {
            type: 'string',
            format: 'uuid'
          },
          divisionId: {
            type: 'string',
            format: 'uuid'
          },
          managerId: {
            type: 'string',
            format: 'uuid'
          },
          candidateTypeId: {
            type: 'string',
            format: 'uuid'
          },
          facultyRankId: {
            type: 'string',
            format: 'uuid'
          },
          status: {
            type: 'string',
            enum: ['draft', 'active', 'on_hold', 'completed', 'canceled'],
            default: 'active'
          },
          offerLetterIssuedAt: {
            type: 'string',
            format: 'date'
          },
          offerLetterAcceptedAt: {
            type: 'string',
            format: 'date'
          },
          anticipatedStartDate: {
            type: 'string',
            format: 'date'
          },
          templateId: {
            type: 'string',
            format: 'uuid',
            description: 'Template to apply when creating candidate'
          }
        },
        required: ['firstName', 'lastName', 'email', 'departmentId', 'candidateTypeId']
      },
      Task: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            format: 'uuid'
          },
          candidateId: {
            type: 'string',
            format: 'uuid'
          },
          title: {
            type: 'string',
            example: 'Complete background check'
          },
          description: {
            type: 'string',
            nullable: true
          },
          status: {
            type: 'string',
            enum: ['todo', 'in_progress', 'blocked', 'done', 'canceled'],
            example: 'todo'
          },
          priorityId: {
            type: 'string',
            format: 'uuid',
            nullable: true
          },
          categoryId: {
            type: 'string',
            format: 'uuid',
            nullable: true
          },
          assigneeKind: {
            type: 'string',
            enum: ['user', 'role'],
            nullable: true
          },
          assigneeUserId: {
            type: 'string',
            format: 'uuid',
            nullable: true
          },
          assigneeRole: {
            type: 'string',
            nullable: true
          },
          dueAt: {
            type: 'string',
            format: 'date-time',
            nullable: true
          },
          required: {
            type: 'boolean',
            example: true
          },
          createdAt: {
            type: 'string',
            format: 'date-time'
          },
          updatedAt: {
            type: 'string',
            format: 'date-time'
          }
        }
      },
      TaskInput: {
        type: 'object',
        properties: {
          candidateId: {
            type: 'string',
            format: 'uuid'
          },
          title: {
            type: 'string'
          },
          description: {
            type: 'string'
          },
          status: {
            type: 'string',
            enum: ['todo', 'in_progress', 'blocked', 'done', 'canceled'],
            default: 'todo'
          },
          priorityId: {
            type: 'string',
            format: 'uuid'
          },
          categoryId: {
            type: 'string',
            format: 'uuid'
          },
          assigneeKind: {
            type: 'string',
            enum: ['user', 'role']
          },
          assigneeUserId: {
            type: 'string',
            format: 'uuid'
          },
          dueAt: {
            type: 'string',
            format: 'date-time'
          },
          required: {
            type: 'boolean',
            default: false
          }
        },
        required: ['candidateId', 'title']
      },
      Template: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            format: 'uuid'
          },
          name: {
            type: 'string',
            example: 'Faculty Onboarding'
          },
          description: {
            type: 'string',
            nullable: true
          },
          isActive: {
            type: 'boolean',
            example: true
          },
          candidateTypeId: {
            type: 'string',
            format: 'uuid',
            nullable: true
          },
          createdAt: {
            type: 'string',
            format: 'date-time'
          },
          updatedAt: {
            type: 'string',
            format: 'date-time'
          }
        }
      },
      TemplateInput: {
        type: 'object',
        properties: {
          name: {
            type: 'string'
          },
          description: {
            type: 'string'
          },
          candidateTypeId: {
            type: 'string',
            format: 'uuid'
          },
          cloneFromTemplateId: {
            type: 'string',
            format: 'uuid',
            description: 'Template to clone from'
          }
        },
        required: ['name']
      },
      User: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            format: 'uuid'
          },
          email: {
            type: 'string',
            format: 'email'
          },
          firstName: {
            type: 'string'
          },
          lastName: {
            type: 'string'
          },
          role: {
            type: 'string',
            enum: ['system_admin', 'hr_staff', 'department_admin', 'division_leader', 'manager', 'candidate']
          },
          status: {
            type: 'string',
            enum: ['active', 'disabled', 'invited']
          },
          departmentId: {
            type: 'string',
            format: 'uuid',
            nullable: true
          },
          divisionId: {
            type: 'string',
            format: 'uuid',
            nullable: true
          },
          createdAt: {
            type: 'string',
            format: 'date-time'
          }
        }
      },
      UserInput: {
        type: 'object',
        properties: {
          email: {
            type: 'string',
            format: 'email'
          },
          firstName: {
            type: 'string'
          },
          lastName: {
            type: 'string'
          },
          password: {
            type: 'string',
            format: 'password'
          },
          role: {
            type: 'string',
            enum: ['system_admin', 'hr_staff', 'department_admin', 'division_leader', 'manager', 'candidate']
          },
          roles: {
            type: 'array',
            items: {
              type: 'string'
            }
          },
          departmentId: {
            type: 'string',
            format: 'uuid'
          },
          divisionId: {
            type: 'string',
            format: 'uuid'
          }
        },
        required: ['email', 'firstName', 'lastName', 'role']
      },
      Department: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            format: 'uuid'
          },
          name: {
            type: 'string',
            example: 'Engineering'
          },
          archived: {
            type: 'boolean',
            example: false
          },
          createdAt: {
            type: 'string',
            format: 'date-time'
          }
        }
      },
      Division: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            format: 'uuid'
          },
          departmentId: {
            type: 'string',
            format: 'uuid'
          },
          name: {
            type: 'string',
            example: 'Software Development'
          },
          archived: {
            type: 'boolean',
            example: false
          },
          createdAt: {
            type: 'string',
            format: 'date-time'
          }
        }
      },
      HiringStage: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            format: 'uuid'
          },
          name: {
            type: 'string',
            example: 'Interview'
          },
          sequence: {
            type: 'number',
            example: 1
          }
        }
      },
      Notification: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            format: 'uuid'
          },
          userId: {
            type: 'string',
            format: 'uuid'
          },
          type: {
            type: 'string',
            example: 'task_assigned'
          },
          entityType: {
            type: 'string',
            example: 'task'
          },
          entityId: {
            type: 'string',
            format: 'uuid'
          },
          isRead: {
            type: 'boolean',
            example: false
          },
          payload: {
            type: 'object'
          },
          createdAt: {
            type: 'string',
            format: 'date-time'
          }
        }
      }
    },
    responses: {
      Unauthorized: {
        description: 'Authentication required',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error'
            },
            example: {
              success: false,
              error: {
                code: 'UNAUTHORIZED',
                message: 'Authentication required',
                requestId: 'a7b3c9d1-e5f8-4a2b-9c3d-1e2f3a4b5c6d'
              }
            }
          }
        }
      },
      Forbidden: {
        description: 'Insufficient permissions',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error'
            },
            example: {
              success: false,
              error: {
                code: 'FORBIDDEN',
                message: 'Insufficient permissions',
                requestId: 'a7b3c9d1-e5f8-4a2b-9c3d-1e2f3a4b5c6d'
              }
            }
          }
        }
      },
      NotFound: {
        description: 'Resource not found',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error'
            },
            example: {
              success: false,
              error: {
                code: 'NOT_FOUND',
                message: 'Resource not found',
                requestId: 'a7b3c9d1-e5f8-4a2b-9c3d-1e2f3a4b5c6d'
              }
            }
          }
        }
      },
      ValidationError: {
        description: 'Validation error',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error'
            },
            example: {
              success: false,
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Validation failed',
                details: [
                  {
                    field: 'firstName',
                    message: 'Required'
                  }
                ],
                requestId: 'a7b3c9d1-e5f8-4a2b-9c3d-1e2f3a4b5c6d'
              }
            }
          }
        }
      }
    }
  },
  security: [
    {
      sessionCookie: []
    }
  ],
  paths: {
    // ==================== CANDIDATE MANAGEMENT ====================
    '/api/candidates': {
      get: {
        tags: ['Candidate Management'],
        summary: 'List all candidates',
        description: 'Retrieves all candidates with optional filtering and authorization context',
        operationId: 'listCandidates',
        parameters: [
          {
            name: 'includeArchived',
            in: 'query',
            description: 'Include archived candidates',
            schema: {
              type: 'boolean',
              default: false
            }
          },
          {
            name: 'status',
            in: 'query',
            description: 'Filter by candidate status',
            schema: {
              type: 'string',
              enum: ['draft', 'active', 'on_hold', 'completed', 'canceled', 'archived']
            }
          },
          {
            name: 'departmentId',
            in: 'query',
            description: 'Filter by department',
            schema: {
              type: 'string',
              format: 'uuid'
            }
          }
        ],
        responses: {
          '200': {
            description: 'List of candidates',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    $ref: '#/components/schemas/Candidate'
                  }
                }
              }
            }
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          },
          '403': {
            $ref: '#/components/responses/Forbidden'
          }
        }
      },
      post: {
        tags: ['Candidate Management'],
        summary: 'Create a new candidate',
        description: 'Creates a new candidate in the hiring pipeline. Requires system_admin, hr_staff, department_admin, division_leader, or manager role.',
        operationId: 'createCandidate',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/CandidateInput'
              },
              examples: {
                basic: {
                  summary: 'Basic candidate creation',
                  value: {
                    firstName: 'John',
                    lastName: 'Doe',
                    email: 'john.doe@example.com',
                    departmentId: '550e8400-e29b-41d4-a716-446655440000',
                    candidateTypeId: '650e8400-e29b-41d4-a716-446655440000',
                    anticipatedStartDate: '2025-06-01'
                  }
                },
                withTemplate: {
                  summary: 'With template application',
                  value: {
                    salutation: 'Dr.',
                    firstName: 'Jane',
                    lastName: 'Smith',
                    email: 'jane.smith@example.com',
                    departmentId: '550e8400-e29b-41d4-a716-446655440000',
                    divisionId: '750e8400-e29b-41d4-a716-446655440000',
                    managerId: '850e8400-e29b-41d4-a716-446655440000',
                    candidateTypeId: '650e8400-e29b-41d4-a716-446655440000',
                    facultyRankId: '950e8400-e29b-41d4-a716-446655440000',
                    offerLetterIssuedAt: '2025-01-15',
                    offerLetterAcceptedAt: '2025-01-20',
                    anticipatedStartDate: '2025-06-01',
                    templateId: 'a50e8400-e29b-41d4-a716-446655440000'
                  }
                }
              }
            }
          }
        },
        responses: {
          '201': {
            description: 'Candidate created successfully',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Candidate'
                }
              }
            }
          },
          '400': {
            description: 'Duplicate email or missing required faculty rank',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error'
                },
                example: {
                  success: false,
                  error: {
                    code: 'BAD_REQUEST',
                    message: 'A candidate with this email already exists',
                    requestId: 'a7b3c9d1-e5f8-4a2b-9c3d-1e2f3a4b5c6d'
                  }
                }
              }
            }
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          },
          '403': {
            $ref: '#/components/responses/Forbidden'
          },
          '422': {
            $ref: '#/components/responses/ValidationError'
          }
        }
      }
    },
    '/api/candidates/{id}': {
      get: {
        tags: ['Candidate Management'],
        summary: 'Get candidate by ID',
        description: 'Retrieves a specific candidate by their ID',
        operationId: 'getCandidateById',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Candidate UUID',
            schema: {
              type: 'string',
              format: 'uuid'
            }
          }
        ],
        responses: {
          '200': {
            description: 'Candidate details',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Candidate'
                }
              }
            }
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          },
          '404': {
            $ref: '#/components/responses/NotFound'
          }
        }
      },
      patch: {
        tags: ['Candidate Management'],
        summary: 'Update candidate',
        description: 'Updates candidate information. Requires system_admin or hr_staff role.',
        operationId: 'updateCandidate',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Candidate UUID',
            schema: {
              type: 'string',
              format: 'uuid'
            }
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  email: { type: 'string', format: 'email' },
                  departmentId: { type: 'string', format: 'uuid' },
                  divisionId: { type: 'string', format: 'uuid' },
                  managerId: { type: 'string', format: 'uuid' },
                  facultyRankId: { type: 'string', format: 'uuid' },
                  status: { type: 'string', enum: ['draft', 'active', 'on_hold', 'completed', 'canceled'] },
                  anticipatedStartDate: { type: 'string', format: 'date' }
                }
              },
              example: {
                firstName: 'Jonathan',
                anticipatedStartDate: '2025-07-01'
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Candidate updated successfully',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Candidate'
                }
              }
            }
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          },
          '403': {
            $ref: '#/components/responses/Forbidden'
          },
          '404': {
            $ref: '#/components/responses/NotFound'
          },
          '422': {
            $ref: '#/components/responses/ValidationError'
          }
        }
      },
      delete: {
        tags: ['Candidate Management'],
        summary: 'Archive candidate',
        description: 'Archives (soft deletes) a candidate. Requires system_admin or hr_staff role.',
        operationId: 'archiveCandidate',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Candidate UUID',
            schema: {
              type: 'string',
              format: 'uuid'
            }
          }
        ],
        responses: {
          '204': {
            description: 'Candidate archived successfully'
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          },
          '403': {
            $ref: '#/components/responses/Forbidden'
          },
          '404': {
            $ref: '#/components/responses/NotFound'
          }
        }
      }
    },
    '/api/candidates/{id}/restore': {
      post: {
        tags: ['Candidate Management'],
        summary: 'Restore archived candidate',
        description: 'Restores a previously archived candidate. Requires system_admin or hr_staff role.',
        operationId: 'restoreCandidate',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Candidate UUID',
            schema: {
              type: 'string',
              format: 'uuid'
            }
          }
        ],
        responses: {
          '200': {
            description: 'Candidate restored successfully',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Candidate'
                }
              }
            }
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          },
          '403': {
            $ref: '#/components/responses/Forbidden'
          },
          '404': {
            $ref: '#/components/responses/NotFound'
          }
        }
      }
    },
    '/api/candidates/{id}/apply-template': {
      post: {
        tags: ['Candidate Management'],
        summary: 'Apply template to candidate',
        description: 'Applies a hiring workflow template to a candidate, creating stages and tasks',
        operationId: 'applyTemplate',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Candidate UUID',
            schema: {
              type: 'string',
              format: 'uuid'
            }
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  templateId: {
                    type: 'string',
                    format: 'uuid',
                    description: 'Template UUID to apply'
                  }
                },
                required: ['templateId']
              },
              example: {
                templateId: 'a50e8400-e29b-41d4-a716-446655440000'
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Template applied successfully',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Candidate'
                }
              }
            }
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          },
          '403': {
            $ref: '#/components/responses/Forbidden'
          },
          '404': {
            $ref: '#/components/responses/NotFound'
          }
        }
      }
    },
    '/api/candidates/{id}/tasks': {
      get: {
        tags: ['Candidate Management'],
        summary: 'Get candidate tasks',
        description: 'Retrieves all tasks associated with a candidate',
        operationId: 'getCandidateTasks',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Candidate UUID',
            schema: {
              type: 'string',
              format: 'uuid'
            }
          }
        ],
        responses: {
          '200': {
            description: 'List of candidate tasks',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    $ref: '#/components/schemas/Task'
                  }
                }
              }
            }
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          },
          '404': {
            $ref: '#/components/responses/NotFound'
          }
        }
      }
    },

    // ==================== TASK MANAGEMENT ====================
    '/api/tasks': {
      get: {
        tags: ['Task Management'],
        summary: 'List tasks',
        description: 'Retrieves tasks filtered by candidate or assignee',
        operationId: 'listTasks',
        parameters: [
          {
            name: 'candidateId',
            in: 'query',
            description: 'Filter by candidate UUID',
            schema: {
              type: 'string',
              format: 'uuid'
            }
          },
          {
            name: 'assigneeId',
            in: 'query',
            description: 'Filter by assignee user UUID',
            schema: {
              type: 'string',
              format: 'uuid'
            }
          },
          {
            name: 'status',
            in: 'query',
            description: 'Filter by task status',
            schema: {
              type: 'string',
              enum: ['todo', 'in_progress', 'blocked', 'done', 'canceled']
            }
          }
        ],
        responses: {
          '200': {
            description: 'List of tasks',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    $ref: '#/components/schemas/Task'
                  }
                }
              }
            }
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          }
        }
      },
      post: {
        tags: ['Task Management'],
        summary: 'Create task',
        description: 'Creates a new task for a candidate. Requires appropriate role permissions.',
        operationId: 'createTask',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/TaskInput'
              },
              example: {
                candidateId: '550e8400-e29b-41d4-a716-446655440000',
                title: 'Complete background check',
                description: 'Submit all required documents',
                assigneeUserId: '750e8400-e29b-41d4-a716-446655440000',
                priorityId: '850e8400-e29b-41d4-a716-446655440000',
                categoryId: '950e8400-e29b-41d4-a716-446655440000',
                dueAt: '2025-02-01T00:00:00.000Z',
                required: true
              }
            }
          }
        },
        responses: {
          '201': {
            description: 'Task created successfully',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Task'
                }
              }
            }
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          },
          '403': {
            $ref: '#/components/responses/Forbidden'
          },
          '422': {
            $ref: '#/components/responses/ValidationError'
          }
        }
      }
    },
    '/api/tasks/mine': {
      get: {
        tags: ['Task Management'],
        summary: 'Get my tasks',
        description: 'Retrieves tasks assigned to the current user with preference-based filtering',
        operationId: 'getMyTasks',
        parameters: [
          {
            name: 'showArchived',
            in: 'query',
            description: 'Show archived tasks',
            schema: {
              type: 'boolean'
            }
          },
          {
            name: 'showCanceled',
            in: 'query',
            description: 'Show canceled and offer-declined candidate tasks',
            schema: {
              type: 'boolean'
            }
          },
          {
            name: 'showCompleted',
            in: 'query',
            description: 'Show completed tasks',
            schema: {
              type: 'boolean'
            }
          }
        ],
        responses: {
          '200': {
            description: 'List of user tasks',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    $ref: '#/components/schemas/Task'
                  }
                }
              }
            }
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          }
        }
      }
    },
    '/api/tasks/{id}': {
      get: {
        tags: ['Task Management'],
        summary: 'Get task by ID',
        description: 'Retrieves a specific task by ID',
        operationId: 'getTaskById',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Task UUID',
            schema: {
              type: 'string',
              format: 'uuid'
            }
          }
        ],
        responses: {
          '200': {
            description: 'Task details',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Task'
                }
              }
            }
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          },
          '404': {
            $ref: '#/components/responses/NotFound'
          }
        }
      },
      patch: {
        tags: ['Task Management'],
        summary: 'Update task',
        description: 'Updates task properties. Can be done by privileged roles or the task assignee (assignees cannot change assigneeUserId). If a task has no assignee and a user updates its status, the task is auto assigned to that user.',
        operationId: 'updateTask',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Task UUID',
            schema: {
              type: 'string',
              format: 'uuid'
            }
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  status: {
                    type: 'string',
                    enum: ['todo', 'in_progress', 'blocked', 'done', 'canceled']
                  },
                  priorityId: { type: 'string', format: 'uuid' },
                  categoryId: { type: 'string', format: 'uuid' },
                  assigneeUserId: { type: 'string', format: 'uuid' },
                  dueAt: { type: 'string', format: 'date-time' },
                  notes: { type: 'string' }
                }
              },
              example: {
                status: 'done',
                notes: 'Completed successfully'
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Task updated successfully',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Task'
                }
              }
            }
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          },
          '403': {
            $ref: '#/components/responses/Forbidden'
          },
          '404': {
            $ref: '#/components/responses/NotFound'
          }
        }
      },
      delete: {
        tags: ['Task Management'],
        summary: 'Delete task',
        description: 'Archives (soft deletes) a task',
        operationId: 'deleteTask',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Task UUID',
            schema: {
              type: 'string',
              format: 'uuid'
            }
          }
        ],
        responses: {
          '204': {
            description: 'Task deleted successfully'
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          },
          '403': {
            $ref: '#/components/responses/Forbidden'
          },
          '404': {
            $ref: '#/components/responses/NotFound'
          }
        }
      }
    },

    // ==================== TEMPLATE MANAGEMENT ====================
    '/api/templates': {
      get: {
        tags: ['Template Management'],
        summary: 'List templates',
        description: 'Retrieves all hiring workflow templates. Requires system_admin or hr_staff role.',
        operationId: 'listTemplates',
        responses: {
          '200': {
            description: 'List of templates',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    $ref: '#/components/schemas/Template'
                  }
                }
              }
            }
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          },
          '403': {
            $ref: '#/components/responses/Forbidden'
          }
        }
      },
      post: {
        tags: ['Template Management'],
        summary: 'Create template',
        description: 'Creates a new hiring workflow template. Optionally clone from an existing template. Requires system_admin or hr_staff role.',
        operationId: 'createTemplate',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/TemplateInput'
              },
              examples: {
                new: {
                  summary: 'Create new template',
                  value: {
                    name: 'Faculty Onboarding',
                    description: 'Standard faculty onboarding process'
                  }
                },
                clone: {
                  summary: 'Clone existing template',
                  value: {
                    name: 'Staff Onboarding (Copy)',
                    description: 'Cloned from Staff Onboarding',
                    cloneFromTemplateId: 'a50e8400-e29b-41d4-a716-446655440000'
                  }
                }
              }
            }
          }
        },
        responses: {
          '201': {
            description: 'Template created successfully',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Template'
                }
              }
            }
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          },
          '403': {
            $ref: '#/components/responses/Forbidden'
          },
          '422': {
            $ref: '#/components/responses/ValidationError'
          }
        }
      }
    },
    '/api/templates/{id}': {
      get: {
        tags: ['Template Management'],
        summary: 'Get template by ID',
        description: 'Retrieves a specific template with all its stages and tasks. Requires system_admin or hr_staff role.',
        operationId: 'getTemplateById',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Template UUID',
            schema: {
              type: 'string',
              format: 'uuid'
            }
          }
        ],
        responses: {
          '200': {
            description: 'Template details',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Template'
                }
              }
            }
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          },
          '403': {
            $ref: '#/components/responses/Forbidden'
          },
          '404': {
            $ref: '#/components/responses/NotFound'
          }
        }
      },
      patch: {
        tags: ['Template Management'],
        summary: 'Update template',
        description: 'Updates template properties. Requires system_admin or hr_staff role.',
        operationId: 'updateTemplate',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Template UUID',
            schema: {
              type: 'string',
              format: 'uuid'
            }
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' }
                }
              },
              example: {
                name: 'Updated Template Name',
                description: 'Updated description'
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Template updated successfully',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Template'
                }
              }
            }
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          },
          '403': {
            $ref: '#/components/responses/Forbidden'
          },
          '404': {
            $ref: '#/components/responses/NotFound'
          }
        }
      },
      delete: {
        tags: ['Template Management'],
        summary: 'Archive template',
        description: 'Archives a template. Requires system_admin or hr_staff role.',
        operationId: 'archiveTemplate',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Template UUID',
            schema: {
              type: 'string',
              format: 'uuid'
            }
          }
        ],
        responses: {
          '204': {
            description: 'Template archived successfully'
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          },
          '403': {
            $ref: '#/components/responses/Forbidden'
          },
          '404': {
            $ref: '#/components/responses/NotFound'
          }
        }
      }
    },
    '/api/templates/{id}/readiness': {
      get: {
        tags: ['Template Management'],
        summary: 'Check template readiness',
        description: 'Checks if a template is ready to be activated (all stages have tasks). Requires system_admin or hr_staff role.',
        operationId: 'getTemplateReadiness',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Template UUID',
            schema: {
              type: 'string',
              format: 'uuid'
            }
          }
        ],
        responses: {
          '200': {
            description: 'Template readiness status',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ready: {
                      type: 'boolean',
                      example: true
                    },
                    issues: {
                      type: 'array',
                      items: {
                        type: 'string'
                      },
                      example: []
                    },
                    stageCount: {
                      type: 'number',
                      example: 5
                    },
                    taskCount: {
                      type: 'number',
                      example: 23
                    }
                  }
                }
              }
            }
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          },
          '403': {
            $ref: '#/components/responses/Forbidden'
          },
          '404': {
            $ref: '#/components/responses/NotFound'
          }
        }
      }
    },

    // ==================== USER MANAGEMENT ====================
    '/api/users': {
      get: {
        tags: ['User Management'],
        summary: 'List users',
        description: 'Retrieves all users with optional filters. Includes pending invitations. Requires system_admin or hr_staff role.',
        operationId: 'listUsers',
        parameters: [
          {
            name: 'status',
            in: 'query',
            description: 'Filter by user status',
            schema: {
              type: 'string',
              enum: ['active', 'invited', 'disabled', 'all']
            }
          },
          {
            name: 'role',
            in: 'query',
            description: 'Filter by role',
            schema: {
              type: 'string'
            }
          },
          {
            name: 'departmentId',
            in: 'query',
            description: 'Filter by department',
            schema: {
              type: 'string',
              format: 'uuid'
            }
          },
          {
            name: 'search',
            in: 'query',
            description: 'Search by name or email',
            schema: {
              type: 'string'
            }
          }
        ],
        responses: {
          '200': {
            description: 'List of users',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    $ref: '#/components/schemas/User'
                  }
                }
              }
            }
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          },
          '403': {
            $ref: '#/components/responses/Forbidden'
          }
        }
      },
      post: {
        tags: ['User Management'],
        summary: 'Create user',
        description: 'Creates a new user with optional password and role assignments. Requires system_admin or hr_staff role.',
        operationId: 'createUser',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/UserInput'
              },
              example: {
                email: 'newuser@example.com',
                firstName: 'John',
                lastName: 'Doe',
                password: 'SecurePassword123!',
                role: 'manager',
                roles: ['manager'],
                departmentId: '550e8400-e29b-41d4-a716-446655440000'
              }
            }
          }
        },
        responses: {
          '201': {
            description: 'User created successfully',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/User'
                }
              }
            }
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          },
          '403': {
            $ref: '#/components/responses/Forbidden'
          },
          '422': {
            $ref: '#/components/responses/ValidationError'
          }
        }
      }
    },
    '/api/users/{id}': {
      patch: {
        tags: ['User Management'],
        summary: 'Update user',
        description: 'Updates user information. Requires system_admin or hr_staff role.',
        operationId: 'updateUser',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'User UUID',
            schema: {
              type: 'string',
              format: 'uuid'
            }
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  email: { type: 'string', format: 'email' },
                  departmentId: { type: 'string', format: 'uuid' },
                  divisionId: { type: 'string', format: 'uuid' }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'User updated successfully',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/User'
                }
              }
            }
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          },
          '403': {
            $ref: '#/components/responses/Forbidden'
          },
          '404': {
            $ref: '#/components/responses/NotFound'
          }
        }
      }
    },
    '/api/users/{id}/disable': {
      post: {
        tags: ['User Management'],
        summary: 'Disable user',
        description: 'Disables a user and optionally reassigns their open tasks. Requires system_admin or hr_staff role.',
        operationId: 'disableUser',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'User UUID',
            schema: {
              type: 'string',
              format: 'uuid'
            }
          }
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  reassignOpenTasksTo: {
                    type: 'string',
                    format: 'uuid',
                    description: 'UUID of user to reassign tasks to'
                  }
                }
              },
              example: {
                reassignOpenTasksTo: '750e8400-e29b-41d4-a716-446655440000'
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'User disabled successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    tasksReassigned: { type: 'number', example: 5 },
                    taskCount: { type: 'number', example: 10 }
                  }
                }
              }
            }
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          },
          '403': {
            $ref: '#/components/responses/Forbidden'
          },
          '404': {
            $ref: '#/components/responses/NotFound'
          }
        }
      }
    },
    '/api/users/{id}/enable': {
      post: {
        tags: ['User Management'],
        summary: 'Enable user',
        description: 'Re-enables a previously disabled user. Requires system_admin or hr_staff role.',
        operationId: 'enableUser',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'User UUID',
            schema: {
              type: 'string',
              format: 'uuid'
            }
          }
        ],
        responses: {
          '200': {
            description: 'User enabled successfully',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/User'
                }
              }
            }
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          },
          '403': {
            $ref: '#/components/responses/Forbidden'
          },
          '404': {
            $ref: '#/components/responses/NotFound'
          }
        }
      }
    },

    // ==================== AUTHENTICATION ====================
    '/api/login': {
      post: {
        tags: ['Authentication'],
        summary: 'Login with local provider',
        description: 'Authenticates a user with email and password using local authentication',
        operationId: 'login',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: {
                    type: 'string',
                    format: 'email',
                    example: 'admin@example.com'
                  },
                  password: {
                    type: 'string',
                    format: 'password',
                    example: 'your-password'
                  }
                },
                required: ['email', 'password']
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Login successful',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/User'
                }
              }
            },
            headers: {
              'Set-Cookie': {
                description: 'Session cookie',
                schema: {
                  type: 'string',
                  example: 'connect.sid=s%3A...; Path=/; HttpOnly'
                }
              }
            }
          },
          '401': {
            description: 'Invalid credentials',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Error'
                },
                example: {
                  success: false,
                  error: {
                    code: 'UNAUTHORIZED',
                    message: 'Invalid email or password'
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/logout': {
      post: {
        tags: ['Authentication'],
        summary: 'Logout',
        description: 'Logs out the current user and destroys the session',
        operationId: 'logout',
        responses: {
          '200': {
            description: 'Logout successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: {
                      type: 'string',
                      example: 'Logged out successfully'
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/user': {
      get: {
        tags: ['Authentication'],
        summary: 'Get current user',
        description: 'Retrieves the currently authenticated user',
        operationId: 'getCurrentUser',
        responses: {
          '200': {
            description: 'Current user details',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/User'
                }
              }
            }
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          }
        }
      }
    },
    '/api/auth/providers': {
      get: {
        tags: ['Authentication'],
        summary: 'Get authentication providers',
        description: 'Retrieves list of available authentication providers with configuration status. Requires system_admin or hr_staff role.',
        operationId: 'getAuthProviders',
        responses: {
          '200': {
            description: 'List of authentication providers',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: {
                        type: 'string',
                        enum: ['local', 'ldap', 'google', 'azuread'],
                        example: 'local'
                      },
                      name: {
                        type: 'string',
                        example: 'Local Authentication'
                      },
                      enabled: {
                        type: 'boolean',
                        example: true
                      },
                      configured: {
                        type: 'boolean',
                        example: true
                      },
                      effectiveEnabled: {
                        type: 'boolean',
                        example: true
                      }
                    }
                  }
                }
              }
            }
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          },
          '403': {
            $ref: '#/components/responses/Forbidden'
          }
        }
      }
    },

    // ==================== REFERENCE DATA ====================
    '/api/departments': {
      get: {
        tags: ['Reference Data'],
        summary: 'List departments',
        description: 'Retrieves all departments with optional archived filter',
        operationId: 'listDepartments',
        parameters: [
          {
            name: 'includeArchived',
            in: 'query',
            description: 'Include archived departments',
            schema: {
              type: 'boolean',
              default: false
            }
          }
        ],
        responses: {
          '200': {
            description: 'List of departments',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    $ref: '#/components/schemas/Department'
                  }
                }
              }
            }
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          }
        }
      },
      post: {
        tags: ['Reference Data'],
        summary: 'Create department',
        description: 'Creates a new department. Requires system_admin or hr_staff role.',
        operationId: 'createDepartment',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                    example: 'Engineering'
                  }
                },
                required: ['name']
              }
            }
          }
        },
        responses: {
          '201': {
            description: 'Department created successfully',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Department'
                }
              }
            }
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          },
          '403': {
            $ref: '#/components/responses/Forbidden'
          },
          '422': {
            $ref: '#/components/responses/ValidationError'
          }
        }
      }
    },
    '/api/departments/{id}': {
      patch: {
        tags: ['Reference Data'],
        summary: 'Update department',
        description: 'Updates department information. Requires system_admin or hr_staff role.',
        operationId: 'updateDepartment',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Department UUID',
            schema: {
              type: 'string',
              format: 'uuid'
            }
          }
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string'
                  }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Department updated successfully',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Department'
                }
              }
            }
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          },
          '403': {
            $ref: '#/components/responses/Forbidden'
          },
          '404': {
            $ref: '#/components/responses/NotFound'
          }
        }
      },
      delete: {
        tags: ['Reference Data'],
        summary: 'Archive department',
        description: 'Archives a department. Requires system_admin or hr_staff role.',
        operationId: 'archiveDepartment',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Department UUID',
            schema: {
              type: 'string',
              format: 'uuid'
            }
          }
        ],
        responses: {
          '200': {
            description: 'Department archived successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: 'Department archived successfully' },
                    department: { $ref: '#/components/schemas/Department' }
                  }
                }
              }
            }
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          },
          '403': {
            $ref: '#/components/responses/Forbidden'
          },
          '404': {
            $ref: '#/components/responses/NotFound'
          }
        }
      }
    },
    '/api/divisions': {
      get: {
        tags: ['Reference Data'],
        summary: 'List divisions',
        description: 'Retrieves divisions with optional filtering',
        operationId: 'listDivisions',
        parameters: [
          {
            name: 'departmentId',
            in: 'query',
            description: 'Filter by department UUID',
            schema: {
              type: 'string',
              format: 'uuid'
            }
          },
          {
            name: 'q',
            in: 'query',
            description: 'Search query',
            schema: {
              type: 'string'
            }
          },
          {
            name: 'limit',
            in: 'query',
            description: 'Results per page',
            schema: {
              type: 'number',
              default: 20
            }
          },
          {
            name: 'offset',
            in: 'query',
            description: 'Pagination offset',
            schema: {
              type: 'number',
              default: 0
            }
          }
        ],
        responses: {
          '200': {
            description: 'List of divisions',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    $ref: '#/components/schemas/Division'
                  }
                }
              }
            }
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          }
        }
      },
      post: {
        tags: ['Reference Data'],
        summary: 'Create division',
        description: 'Creates a new division. Requires system_admin or hr_staff role.',
        operationId: 'createDivision',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  departmentId: {
                    type: 'string',
                    format: 'uuid'
                  },
                  name: {
                    type: 'string',
                    example: 'Software Development'
                  }
                },
                required: ['departmentId', 'name']
              }
            }
          }
        },
        responses: {
          '201': {
            description: 'Division created successfully',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Division'
                }
              }
            }
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          },
          '403': {
            $ref: '#/components/responses/Forbidden'
          },
          '422': {
            $ref: '#/components/responses/ValidationError'
          }
        }
      }
    },
    '/api/hiring-stages': {
      get: {
        tags: ['Reference Data'],
        summary: 'List hiring stages',
        description: 'Retrieves all hiring stage reference data',
        operationId: 'listHiringStages',
        responses: {
          '200': {
            description: 'List of hiring stages',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    $ref: '#/components/schemas/HiringStage'
                  }
                }
              }
            }
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          }
        }
      },
      post: {
        tags: ['Reference Data'],
        summary: 'Create hiring stage',
        description: 'Creates a new hiring stage option. Requires system_admin or hr_staff role.',
        operationId: 'createHiringStage',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                    example: 'Interview'
                  },
                  sequence: {
                    type: 'number',
                    example: 1
                  }
                },
                required: ['name', 'sequence']
              }
            }
          }
        },
        responses: {
          '201': {
            description: 'Hiring stage created successfully',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/HiringStage'
                }
              }
            }
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          },
          '403': {
            $ref: '#/components/responses/Forbidden'
          },
          '422': {
            $ref: '#/components/responses/ValidationError'
          }
        }
      }
    },
    '/api/task-categories': {
      get: {
        tags: ['Reference Data'],
        summary: 'List task categories',
        description: 'Retrieves all task category options',
        operationId: 'listTaskCategories',
        responses: {
          '200': {
            description: 'List of task categories',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', format: 'uuid' },
                      name: { type: 'string', example: 'HR' }
                    }
                  }
                }
              }
            }
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          }
        }
      }
    },
    '/api/task-priorities': {
      get: {
        tags: ['Reference Data'],
        summary: 'List task priorities',
        description: 'Retrieves all task priority options',
        operationId: 'listTaskPriorities',
        responses: {
          '200': {
            description: 'List of task priorities',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', format: 'uuid' },
                      name: { type: 'string', example: 'High' }
                    }
                  }
                }
              }
            }
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          }
        }
      }
    },
    '/api/candidate-types': {
      get: {
        tags: ['Reference Data'],
        summary: 'List candidate types',
        description: 'Retrieves all candidate type options',
        operationId: 'listCandidateTypes',
        responses: {
          '200': {
            description: 'List of candidate types',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', format: 'uuid' },
                      name: { type: 'string', example: 'Faculty' }
                    }
                  }
                }
              }
            }
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          }
        }
      }
    },
    '/api/faculty-ranks': {
      get: {
        tags: ['Reference Data'],
        summary: 'List faculty ranks',
        description: 'Retrieves all faculty rank options. Requires system_admin, hr_staff, or department_admin role.',
        operationId: 'listFacultyRanks',
        responses: {
          '200': {
            description: 'List of faculty ranks',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string', format: 'uuid' },
                      name: { type: 'string', example: 'Associate Professor' }
                    }
                  }
                }
              }
            }
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          },
          '403': {
            $ref: '#/components/responses/Forbidden'
          }
        }
      }
    },

    // ==================== NOTIFICATIONS ====================
    '/api/notifications': {
      get: {
        tags: ['Notifications'],
        summary: 'List notifications',
        description: 'Retrieves notifications for the current user',
        operationId: 'listNotifications',
        parameters: [
          {
            name: 'limit',
            in: 'query',
            description: 'Number of notifications to return',
            schema: {
              type: 'number',
              default: 20
            }
          },
          {
            name: 'unreadOnly',
            in: 'query',
            description: 'Return only unread notifications',
            schema: {
              type: 'boolean',
              default: false
            }
          }
        ],
        responses: {
          '200': {
            description: 'List of notifications',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    items: {
                      type: 'array',
                      items: {
                        $ref: '#/components/schemas/Notification'
                      }
                    },
                    unreadCount: {
                      type: 'number',
                      example: 5
                    }
                  }
                }
              }
            }
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          }
        }
      }
    },
    '/api/notifications/{id}': {
      patch: {
        tags: ['Notifications'],
        summary: 'Mark notification as read',
        description: 'Marks a specific notification as read',
        operationId: 'markNotificationRead',
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Notification UUID',
            schema: {
              type: 'string',
              format: 'uuid'
            }
          }
        ],
        responses: {
          '200': {
            description: 'Notification marked as read',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Notification'
                }
              }
            }
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          },
          '404': {
            $ref: '#/components/responses/NotFound'
          }
        }
      }
    },
    '/api/notifications/mark-all-read': {
      post: {
        tags: ['Notifications'],
        summary: 'Mark all notifications as read',
        description: 'Marks all notifications for the current user as read',
        operationId: 'markAllNotificationsRead',
        responses: {
          '200': {
            description: 'All notifications marked as read',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: {
                      type: 'boolean',
                      example: true
                    },
                    message: {
                      type: 'string',
                      example: 'All notifications marked as read'
                    }
                  }
                }
              }
            }
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          }
        }
      }
    },

    // ==================== SYSTEM SETTINGS ====================
    '/api/system-settings': {
      get: {
        tags: ['System Settings'],
        summary: 'Get system settings',
        description: 'Retrieves system-wide configuration settings. Requires system_admin or hr_staff role.',
        operationId: 'getSystemSettings',
        responses: {
          '200': {
            description: 'System settings',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    auto_regress_on_prior_open: {
                      type: 'boolean',
                      example: false
                    }
                  }
                }
              }
            }
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          },
          '403': {
            $ref: '#/components/responses/Forbidden'
          }
        }
      },
      patch: {
        tags: ['System Settings'],
        summary: 'Update system settings',
        description: 'Updates system configuration. Requires system_admin or hr_staff role.',
        operationId: 'updateSystemSettings',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  auto_regress_on_prior_open: {
                    type: 'boolean'
                  }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Settings updated successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    auto_regress_on_prior_open: {
                      type: 'boolean'
                    }
                  }
                }
              }
            }
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          },
          '403': {
            $ref: '#/components/responses/Forbidden'
          }
        }
      }
    },
    '/api/settings/email': {
      get: {
        tags: ['System Settings'],
        summary: 'Get email settings',
        description: 'Retrieves SMTP configuration (passwords masked). Requires system_admin role.',
        operationId: 'getEmailSettings',
        responses: {
          '200': {
            description: 'Email settings',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    host: { type: 'string', example: 'smtp.gmail.com' },
                    port: { type: 'number', example: 587 },
                    from: { type: 'string', example: 'noreply@example.com' },
                    username: { type: 'string', example: 'user@example.com' },
                    security: { type: 'string', enum: ['none', 'starttls', 'ssl_tls'], example: 'starttls' },
                    authType: { type: 'string', enum: ['none', 'plain', 'login', 'cram_md5', 'xoauth2'], example: 'plain' }
                  }
                }
              }
            }
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          },
          '403': {
            $ref: '#/components/responses/Forbidden'
          }
        }
      },
      patch: {
        tags: ['System Settings'],
        summary: 'Update email settings',
        description: 'Updates SMTP configuration. Requires system_admin role.',
        operationId: 'updateEmailSettings',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  host: { type: 'string' },
                  port: { type: 'number' },
                  from: { type: 'string' },
                  username: { type: 'string' },
                  password: { type: 'string', format: 'password' },
                  security: { type: 'string', enum: ['none', 'starttls', 'ssl_tls'] },
                  authType: { type: 'string', enum: ['none', 'plain', 'login', 'cram_md5', 'xoauth2'] }
                }
              }
            }
          }
        },
        responses: {
          '200': {
            description: 'Email settings updated successfully'
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          },
          '403': {
            $ref: '#/components/responses/Forbidden'
          }
        }
      }
    },
    '/api/settings/email/test': {
      post: {
        tags: ['System Settings'],
        summary: 'Test email configuration',
        description: 'Sends a test email to the current user. Requires system_admin role.',
        operationId: 'testEmailSettings',
        responses: {
          '200': {
            description: 'Test email sent',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean', example: true }
                  }
                }
              }
            }
          },
          '401': {
            $ref: '#/components/responses/Unauthorized'
          },
          '403': {
            $ref: '#/components/responses/Forbidden'
          }
        }
      }
    }
  }
};
