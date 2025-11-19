# Contributing to OnBoardPro

Thank you for your interest in contributing to OnBoardPro! This document provides guidelines and best practices for contributing to the project.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Code Style](#code-style)
- [Project Structure](#project-structure)
- [Making Changes](#making-changes)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Architecture Guidelines](#architecture-guidelines)
- [Common Tasks](#common-tasks)

---

## Getting Started

### Prerequisites

- **Node.js:** 18.x or higher
- **npm:** 9.x or higher
- **Docker:** For local PostgreSQL database
- **Git:** For version control

### First-Time Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/OnBoardPro.git
   cd OnBoardPro
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment**
   ```bash
   cp .env.example .env
   # Edit .env and set required variables
   ```

4. **Generate SESSION_SECRET**
   ```bash
   openssl rand -base64 32
   # Add the output to .env as SESSION_SECRET
   ```

5. **Start PostgreSQL**
   ```bash
   docker-compose up -d
   ```

6. **Initialize database**
   ```bash
   npm run db:push
   ```

7. **Start development server**
   ```bash
   npm run dev
   ```

8. **Verify setup**
   ```bash
   # Application should be running at http://localhost:5000
   curl http://localhost:5000/health
   ```

---

## Development Setup

### Environment Variables

Key environment variables (see `.env.example` for complete list):

```bash
# Required
DATABASE_URL=postgresql://user:password@localhost:5432/onboardpro
SESSION_SECRET=your-32-character-minimum-secret

# Optional
PORT=5000
NODE_ENV=development
RATE_LIMIT_MAX=120
```

### Database Commands

```bash
# Push schema changes to database
npm run db:push

# Import database export
npm run db:import

# Set user password (for testing)
npm run user:set-password
```

### Docker Commands

```bash
# Start PostgreSQL
docker-compose up -d

# Stop PostgreSQL
docker-compose down

# View logs
docker-compose logs -f

# Reset database (destructive!)
docker-compose down -v
docker-compose up -d
npm run db:push
```

---

## Code Style

### TypeScript

- Use **strict mode**
- Prefer `const` over `let`, avoid `var`
- Use explicit types for function parameters and returns
- Use interface for object shapes, type for unions

```typescript
// ✅ Good
interface User {
  id: string;
  email: string;
}

function getUser(id: string): Promise<User | null> {
  // ...
}

// ❌ Bad
function getUser(id) {
  // ...
}
```

### Naming Conventions

- **Files:** `kebab-case.ts` (e.g., `user-service.ts`)
- **Components:** `PascalCase.tsx` (e.g., `UserCard.tsx`)
- **Functions:** `camelCase` (e.g., `getUserById`)
- **Constants:** `SCREAMING_SNAKE_CASE` (e.g., `MAX_RETRIES`)
- **Types/Interfaces:** `PascalCase` (e.g., `UserProfile`)

### Imports

Organize imports in this order:
1. External packages
2. Internal modules (using path aliases)
3. Types
4. Relative imports

```typescript
// ✅ Good
import express from "express";
import { z } from "zod";

import { requireAuth } from "@/middleware/authorization";
import { storage } from "@/db/storage";

import type { User } from "@shared/schemas";

import { validateEmail } from "./utils";
```

### Error Handling

Use the structured error handler:

```typescript
import { ApiError } from "@/utils/error-handler";

// ✅ Good
if (!candidate) {
  throw ApiError.notFound("Candidate");
}

if (!isValid) {
  throw ApiError.validationError("Invalid input", { field: "email" });
}

// ❌ Bad
if (!candidate) {
  throw new Error("Not found");
}
```

---

## Project Structure

```
OnBoardPro/
├── client/               # Frontend React application
│   └── src/
│       ├── app/         # Route-based pages
│       ├── features/    # Feature-specific code
│       ├── shared/      # Reusable components
│       └── lib/         # Utilities
│
├── server/              # Backend Express application
│   ├── config/          # Configuration
│   ├── middleware/      # Middleware functions
│   ├── routes/          # Additional routes
│   ├── features/        # Feature modules
│   │   ├── auth/
│   │   ├── candidates/
│   │   ├── tasks/
│   │   ├── notifications/
│   │   └── email/
│   ├── db/             # Database layer
│   ├── jobs/           # Background jobs
│   ├── observability/  # Monitoring
│   └── utils/          # Utilities
│
├── shared/             # Shared code (client & server)
│   └── schema.ts       # Database schema & types
│
└── docs/              # Documentation
    ├── ARCHITECTURE.md
    ├── API_EXAMPLES.md
    └── QUICK_WINS.md
```

### Path Aliases

- `@/` → `client/src/`
- `@shared/` → `shared/`

---

## Making Changes

### Branch Naming

- `feature/` - New features
- `fix/` - Bug fixes
- `refactor/` - Code refactoring
- `docs/` - Documentation changes
- `test/` - Test additions/changes

Examples:
- `feature/add-user-export`
- `fix/session-timeout`
- `refactor/extract-services`

### Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style changes (formatting)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

**Examples:**
```bash
feat(candidates): add bulk import functionality

Implement CSV import for candidates with validation
and error reporting.

Closes #123
```

```bash
fix(auth): resolve session timeout issue

Users were being logged out prematurely due to incorrect
cookie expiration calculation.

Fixes #456
```

---

## Testing

### Run Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- server/tests/auth.test.ts

# Run tests in watch mode
npm test -- --watch

# Run with coverage
npm test -- --coverage
```

### Writing Tests

#### Service Layer Tests

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStorage } from '../utils/inMemoryStorage';
import { myService } from './my-service';

describe('MyService', () => {
  let storage: InMemoryStorage;

  beforeEach(() => {
    storage = new InMemoryStorage();
    // Seed test data
  });

  it('should do something', async () => {
    const result = await myService.doSomething(storage);
    expect(result).toBe(expected);
  });
});
```

#### API Integration Tests

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
    const response = await agent.post('/api/candidates').send({});
    expect(response.status).toBe(403);
  });
});
```

### Test Coverage Goals

- **Unit tests:** 80% coverage
- **Integration tests:** Critical user flows
- **E2E tests:** Authentication, candidate creation, task completion

---

## Pull Request Process

### Before Submitting

1. **Update from main branch**
   ```bash
   git checkout main
   git pull origin main
   git checkout your-feature-branch
   git rebase main
   ```

2. **Run type checking**
   ```bash
   npm run check
   ```

3. **Run tests**
   ```bash
   npm test
   ```

4. **Test manually**
   - Start the dev server
   - Test your changes in the browser
   - Check the console for errors

5. **Update documentation**
   - Update relevant docs in `/docs/`
   - Add API examples if needed
   - Update README if required

### Submitting a Pull Request

1. **Push your branch**
   ```bash
   git push origin your-feature-branch
   ```

2. **Create pull request on GitHub**
   - Use a clear, descriptive title
   - Reference related issues
   - Provide context and screenshots

3. **PR Description Template**
   ```markdown
   ## Description
   Brief description of changes

   ## Type of Change
   - [ ] Bug fix
   - [ ] New feature
   - [ ] Breaking change
   - [ ] Documentation update

   ## Testing
   - [ ] Unit tests added/updated
   - [ ] Integration tests added/updated
   - [ ] Manual testing completed

   ## Checklist
   - [ ] Code follows style guidelines
   - [ ] Self-reviewed code
   - [ ] Commented complex logic
   - [ ] Updated documentation
   - [ ] No new warnings
   - [ ] Tests pass locally

   ## Screenshots (if applicable)
   [Add screenshots here]

   ## Related Issues
   Closes #123
   ```

4. **Respond to feedback**
   - Address review comments
   - Push updates to the same branch
   - Mark conversations as resolved

### After Approval

- Squash commits if requested
- Ensure CI passes (if configured)
- Maintainer will merge

---

## Architecture Guidelines

### Follow Clean Architecture Principles

1. **Separation of Concerns**
   - Keep route handlers thin
   - Move business logic to service layer
   - Use DTOs for validation

2. **Dependency Injection**
   ```typescript
   // ✅ Good - testable
   class CandidateService {
     constructor(private storage: IStorage) {}

     async createCandidate(data: CreateCandidateDTO) {
       // ...
     }
   }

   // ❌ Bad - hard to test
   class CandidateService {
     async createCandidate(data: any) {
       const result = await storage.createCandidate(data);
       // ...
     }
   }
   ```

3. **Use DTOs for Validation**
   ```typescript
   // Define DTO
   export const createCandidateDTO = z.object({
     firstName: z.string().min(1),
     email: z.string().email()
   });

   // Use in route
   app.post('/api/candidates', async (req, res) => {
     const data = createCandidateDTO.parse(req.body);
     const candidate = await candidateService.create(data);
     res.status(201).json(candidate);
   });
   ```

### Database Patterns

- Use Drizzle ORM for all queries
- Always use transactions for multi-step operations
- Add proper indexes for query performance
- Use soft deletes (archived flag) instead of hard deletes

```typescript
// ✅ Good - transaction
await db.transaction(async (trx) => {
  await trx.insert(candidates).values(data);
  await trx.insert(candidateTasks).values(tasks);
});

// ❌ Bad - no transaction
await db.insert(candidates).values(data);
await db.insert(candidateTasks).values(tasks);
```

### Error Handling

Always use structured errors:

```typescript
// Route handler
try {
  const result = await service.doSomething();
  res.json(result);
} catch (error) {
  // Error handler middleware will catch and format
  throw ApiError.internal("Failed to process request");
}
```

---

## Common Tasks

### Adding a New API Endpoint

1. **Define DTO** (if needed)
   ```typescript
   // server/features/myfeature/dto/my.dto.ts
   export const myDTO = z.object({
     field: z.string()
   });
   ```

2. **Add route handler**
   ```typescript
   // server/routes.ts
   app.post('/api/myendpoint', requireAuth, async (req, res, next) => {
     try {
       const data = myDTO.parse(req.body);
       const result = await storage.doSomething(data);
       res.json(result);
     } catch (error) {
       next(error);
     }
   });
   ```

3. **Add tests**
   ```typescript
   // server/tests/api/myendpoint.test.ts
   describe('POST /api/myendpoint', () => {
     it('should work', async () => {
       // test implementation
     });
   });
   ```

4. **Update API docs**
   ```markdown
   // docs/API_EXAMPLES.md
   ### My New Endpoint
   ```bash
   curl -X POST http://localhost:5000/api/myendpoint \
     -H "Content-Type: application/json" \
     -d '{"field":"value"}'
   ```
   ```

### Adding a Database Table

1. **Update schema**
   ```typescript
   // shared/schema.ts
   export const myTable = pgTable("my_table", {
     id: uuid("id").primaryKey(),
     field: text("field").notNull(),
     createdAt: timestamp("created_at").defaultNow()
   });
   ```

2. **Push to database**
   ```bash
   npm run db:push
   ```

3. **Add storage methods**
   ```typescript
   // server/db/storage.ts
   async getMyData(): Promise<MyData[]> {
     return await this.db.select().from(myTable);
   }
   ```

### Adding a Background Job

1. **Create job file**
   ```typescript
   // server/jobs/my-job.ts
   export function startMyJob() {
     setInterval(async () => {
       try {
         await processJob();
       } catch (error) {
         console.error('Job failed:', error);
       }
     }, 60000); // 1 minute
   }
   ```

2. **Register in index.ts**
   ```typescript
   // server/index.ts
   import { startMyJob } from './jobs/my-job';

   if (env.DISABLE_MY_JOB !== '1') {
     startMyJob();
   }
   ```

---

## Getting Help

- **Documentation:** Check `/docs/` directory
- **Issues:** Search existing GitHub issues
- **Questions:** Open a GitHub Discussion
- **Architecture:** Review `/docs/ARCHITECTURE_REVIEW.md`

---

## Code of Conduct

### Our Pledge

We are committed to providing a welcoming and inspiring community for all.

### Our Standards

- Be respectful and inclusive
- Accept constructive criticism gracefully
- Focus on what is best for the community
- Show empathy towards other community members

### Unacceptable Behavior

- Harassment or discrimination
- Trolling or insulting comments
- Public or private harassment
- Publishing others' private information

---

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.

---

## Thank You!

Thank you for contributing to OnBoardPro! Your efforts help make this project better for everyone.

**Questions?** Open an issue or start a discussion on GitHub.
