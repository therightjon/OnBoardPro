# Quick Wins - Immediate Architectural Improvements

This document outlines small, high-impact changes that can be implemented quickly to improve the OnBoardPro architecture.

---

## Security Quick Wins (1-2 days)

### 1. Fix Session Cookie Configuration
**File:** `server/features/auth/services/auth.service.ts:120-124`
**Impact:** Prevents CSRF attacks
**Effort:** 5 minutes

```typescript
// BEFORE
cookie: {
  maxAge: 7 * 24 * 60 * 60 * 1000,
  secure: process.env.NODE_ENV === "production",
  httpOnly: true
}

// AFTER
cookie: {
  maxAge: 7 * 24 * 60 * 60 * 1000,
  secure: process.env.NODE_ENV === "production",
  httpOnly: true,
  sameSite: 'strict',  // Add this to prevent CSRF
  domain: process.env.COOKIE_DOMAIN  // Make configurable
}
```

### 2. Add Security Headers with Helmet
**Files:** `server/index.ts`, `package.json`
**Impact:** Protection against common web vulnerabilities
**Effort:** 30 minutes

```bash
npm install helmet
```

```typescript
// server/index.ts (add after line 10)
import helmet from 'helmet';

const app = express();
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  }
}));
```

### 3. Remove Default Session Secret
**File:** `server/features/auth/services/auth.service.ts:113`
**Impact:** Prevents session hijacking in production
**Effort:** 10 minutes

```typescript
// BEFORE
secret: process.env.SESSION_SECRET || "dev-secret-key-change-in-production",

// AFTER
secret: process.env.SESSION_SECRET,  // Remove default

// Add validation at startup
if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required");
}
```

---

## Code Quality Quick Wins (2-3 days)

### 4. Extract Rate Limiter to Separate Module
**Current:** `server/routes.ts:76-125`
**Impact:** Code reusability and testability
**Effort:** 1 hour

Create: `server/middleware/rate-limiter.ts`
```typescript
export function createRateLimiter(options: RateLimiterOptions) {
  // Move existing code here
}

export const defaultRateLimiter = createRateLimiter({
  windowMs: DEFAULT_RATE_LIMIT_WINDOW_MS,
  max: DEFAULT_RATE_LIMIT_MAX,
  name: "default"
});

export const sensitiveRateLimiter = createRateLimiter({
  windowMs: SENSITIVE_RATE_LIMIT_WINDOW_MS,
  max: SENSITIVE_RATE_LIMIT_MAX,
  name: "sensitive"
});
```

### 5. Extract Authorization Middleware
**Current:** `server/routes.ts:42-65`
**Impact:** Separation of concerns
**Effort:** 1 hour

Create: `server/middleware/authorization.ts`
```typescript
export function requireAuth(req: any, res: any, next: any) {
  // Move from routes.ts
}

export function requireRole(roles: string[]) {
  // Move from routes.ts
}
```

### 6. Extract Validation Schemas to DTOs
**Current:** Inline validation in route handlers
**Impact:** Reusability and consistency
**Effort:** 2 hours

Create: `server/features/candidates/dto/create-candidate.dto.ts`
```typescript
import { z } from 'zod';
import { insertCandidateSchema } from '@shared/schemas';

export const createCandidateDTO = insertCandidateSchema.extend({
  templateId: z.string().uuid().optional()
});

export type CreateCandidateDTO = z.infer<typeof createCandidateDTO>;
```

---

## Observability Quick Wins (1 day)

### 7. Add Health Check Endpoint
**File:** Create `server/routes/health.ts`
**Impact:** Production monitoring and Kubernetes readiness
**Effort:** 1 hour

```typescript
import { Router } from 'express';
import { db } from '../db/connection';

const router = Router();

router.get('/health', async (req, res) => {
  try {
    // Check database connectivity
    await db.execute(sql`SELECT 1`);

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {
        database: 'up',
        server: 'up'
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      checks: {
        database: 'down',
        server: 'up'
      },
      error: error.message
    });
  }
});

router.get('/health/ready', async (req, res) => {
  // Readiness check for K8s
  try {
    await db.execute(sql`SELECT 1`);
    res.status(200).send('OK');
  } catch (error) {
    res.status(503).send('Not Ready');
  }
});

router.get('/health/live', (req, res) => {
  // Liveness check for K8s
  res.status(200).send('OK');
});

export default router;
```

Register in `server/index.ts`:
```typescript
import healthRouter from './routes/health';
app.use(healthRouter);
```

### 8. Add Request ID Middleware
**File:** `server/middleware/request-id.ts`
**Impact:** Request tracing and debugging
**Effort:** 30 minutes

```typescript
import { randomUUID } from 'crypto';

export function requestIdMiddleware(req: any, res: any, next: any) {
  req.id = randomUUID();
  res.setHeader('X-Request-ID', req.id);
  next();
}
```

Update logging:
```typescript
// server/index.ts logging middleware
log(`[${req.id}] ${req.method} ${path} ${res.statusCode} in ${duration}ms`);
```

### 9. Structured Error Responses
**File:** Create `server/utils/error-handler.ts`
**Impact:** Consistent API error handling
**Effort:** 1 hour

```typescript
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function errorHandler(err: any, req: any, res: any, next: any) {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        requestId: req.id
      }
    });
  }

  // Unexpected errors
  console.error('Unexpected error:', err);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      requestId: req.id
    }
  });
}
```

---

## Testing Quick Wins (2-3 days)

### 10. Add Service Layer Tests
**Impact:** Prevent regressions in business logic
**Effort:** 2 hours per service

Example: `server/features/tasks/services/advance-stage.service.test.ts`
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { advanceStageIfComplete } from './advance-stage.service';
import { InMemoryStorage } from '../../tests/utils/inMemoryStorage';

describe('advanceStageIfComplete', () => {
  let storage: InMemoryStorage;

  beforeEach(() => {
    storage = new InMemoryStorage();
    // Seed test data
  });

  it('should advance stage when all required tasks are complete', async () => {
    // Arrange
    const candidateId = 'test-candidate-id';
    const userId = 'test-user-id';

    // Act
    const result = await advanceStageIfComplete({ candidateId, invokerUserId: userId });

    // Assert
    expect(result.advanced).toBe(true);
    expect(result.toStageId).toBe('next-stage-id');
  });

  it('should not advance when required tasks are incomplete', async () => {
    // Test case
  });
});
```

### 11. Add API Integration Tests
**Impact:** Ensure endpoints work correctly
**Effort:** 1 hour per feature

Example: `server/tests/api/candidates.test.ts`
```typescript
import { describe, it, expect } from 'vitest';
import { testAgent } from '../utils/testAgent';

describe('POST /api/candidates', () => {
  it('should create candidate with valid data', async () => {
    const agent = await testAgent({ role: 'hr_staff' });

    const response = await agent
      .post('/api/candidates')
      .send({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        // ... other fields
      });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id');
  });

  it('should reject unauthorized users', async () => {
    const agent = await testAgent({ role: 'candidate' });

    const response = await agent
      .post('/api/candidates')
      .send({});

    expect(response.status).toBe(403);
  });
});
```

---

## Documentation Quick Wins (1 day)

### 12. Add API Response Examples to README
**File:** Create `docs/API_EXAMPLES.md`
**Impact:** Developer onboarding
**Effort:** 2 hours

```markdown
# API Examples

## Authentication

### Login
```bash
curl -X POST http://localhost:5000/api/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'
```

Response:
```json
{
  "id": "user-id",
  "email": "user@example.com",
  "role": "hr_staff"
}
```

## Candidates

### Create Candidate
```bash
curl -X POST http://localhost:5000/api/candidates \
  -H "Content-Type: application/json" \
  -b "connect.sid=your-session-cookie" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "candidateTypeId": "...",
    "departmentId": "..."
  }'
```
```

### 13. Add Architecture Diagram
**File:** `docs/ARCHITECTURE.md`
**Impact:** Visual understanding of system
**Effort:** 1 hour

```markdown
# Architecture Overview

## System Context
```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │ HTTPS
       ↓
┌─────────────────────────────┐
│   Express.js Server         │
│  - REST API                 │
│  - Session Auth             │
│  - Background Jobs          │
└──────┬──────────────────────┘
       │
       ↓
┌─────────────┐    ┌─────────┐
│ PostgreSQL  │    │  SMTP   │
│  - Drizzle  │    │ Server  │
└─────────────┘    └─────────┘
```

## Component Diagram
[Add detailed component diagram]
```

### 14. Create CONTRIBUTING.md
**File:** `CONTRIBUTING.md`
**Impact:** Standardize development process
**Effort:** 1 hour

```markdown
# Contributing to OnBoardPro

## Development Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Start PostgreSQL: `docker-compose up -d`
4. Initialize database: `npm run db:push`
5. Start dev server: `npm run dev`

## Code Style

- Use TypeScript strict mode
- Follow existing patterns
- Write tests for new features
- Run `npm run check` before committing

## Pull Request Process

1. Create a feature branch
2. Make your changes
3. Add tests
4. Update documentation
5. Submit PR with description
```

---

## Performance Quick Wins (1-2 days)

### 15. Add Database Query Logging in Development
**File:** `server/db/connection.ts`
**Impact:** Identify slow queries
**Effort:** 30 minutes

```typescript
import { drizzle } from 'drizzle-orm/node-postgres';

const db = drizzle(pool, {
  logger: process.env.NODE_ENV === 'development' ? {
    logQuery(query: string, params: unknown[]) {
      console.log('Query:', query);
      console.log('Params:', params);
    }
  } : undefined
});
```

### 16. Add Response Compression
**Files:** `server/index.ts`, `package.json`
**Impact:** Reduce bandwidth and improve response times
**Effort:** 15 minutes

```bash
npm install compression
```

```typescript
// server/index.ts
import compression from 'compression';

const app = express();
app.use(compression());
```

### 17. Add ETag Support for Static Resources
**File:** `server/index.ts`
**Impact:** Browser caching
**Effort:** 10 minutes

```typescript
// Already enabled by default in Express
app.set('etag', 'strong');
```

---

## Configuration Quick Wins (1 day)

### 18. Create Environment Configuration Schema
**File:** Create `server/config/env.ts`
**Impact:** Type-safe environment variables
**Effort:** 1 hour

```typescript
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(5000),
  DATABASE_URL: z.string(),
  SESSION_SECRET: z.string().min(32),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().default(120),

  // SMTP
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),

  // Feature flags
  DISABLE_DEADLINE_SCANNER: z.string().optional(),
  DISABLE_EMAIL_JOBS: z.string().optional()
});

export const env = envSchema.parse(process.env);
```

### 19. Add .env.example File
**File:** `.env.example`
**Impact:** Developer onboarding
**Effort:** 15 minutes

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/onboardpro

# Server
PORT=5000
NODE_ENV=development

# Security
SESSION_SECRET=your-secret-key-min-32-chars

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=120

# Background Jobs
DISABLE_DEADLINE_SCANNER=0
DISABLE_EMAIL_JOBS=0

# SMTP (Optional)
SMTP_HOST=
SMTP_PORT=
```

### 20. Add Environment Validation at Startup
**File:** `server/index.ts` (add before server starts)
**Impact:** Fail fast on misconfiguration
**Effort:** 30 minutes

```typescript
import { env } from './config/env';

// Validation happens on import
console.log('✓ Environment configuration validated');
console.log(`  NODE_ENV: ${env.NODE_ENV}`);
console.log(`  PORT: ${env.PORT}`);
console.log(`  DATABASE_URL: ${env.DATABASE_URL.substring(0, 20)}...`);
```

---

## Summary

These 20 quick wins can be implemented in **1-2 weeks** and will significantly improve:
- **Security** (items 1-3)
- **Code Quality** (items 4-6)
- **Observability** (items 7-9)
- **Testing** (items 10-11)
- **Documentation** (items 12-14)
- **Performance** (items 15-17)
- **Configuration** (items 18-20)

**Recommended Order:**
1. Security fixes (1-3) - **Day 1**
2. Health check & error handling (7-9) - **Day 2**
3. Extract middleware (4-5) - **Day 3**
4. Testing infrastructure (10-11) - **Days 4-5**
5. Configuration (18-20) - **Day 6**
6. Documentation (12-14) - **Days 7-8**
7. Performance (15-17) - **Day 9**
8. DTOs and validation (6) - **Day 10**

All items are **low-risk** and can be implemented without disrupting existing functionality.
