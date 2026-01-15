# Copilot Instructions for OnBoardPro

## Project Overview
OnBoardPro is a hiring pipeline management system. TypeScript monorepo with Express/Drizzle/PostgreSQL backend and Vite + React 18 SPA. Shared types in `shared/` enable type-safe API contracts via `@shared` alias.

## Development Commands

```bash
# Build and Development
npm run dev           # Start Vite + Express dev server (port 5000)
npm run build         # Build for production
npm start             # Start production server
npm run check         # TypeScript type-check

# Database
npm run db:push       # Push schema changes to database
npm run db:import     # Import database export
npm run user:set-password  # Set user password

# Docker
docker-compose up     # Start PostgreSQL 16 locally (port 5432)
```

## Architecture

### Backend (Routes → Services → Repositories → Drizzle)
```
server/routes/*.routes.ts     # HTTP handlers, validation, auth guards
server/services/              # Business logic, event publishing
server/repositories/          # Data access with BaseRepository patterns
shared/schema.ts              # Drizzle schema + Zod validation schemas
```

### Frontend
- **Router:** Wouter for client-side routing
- **State:** TanStack Query for server state, React hooks for local
- **UI:** Radix UI + shadcn/ui in `client/src/shared/components/ui/`
- **Styling:** TailwindCSS with custom design system
- **Forms:** React Hook Form + Zod validation

### Domain Events
Event-driven via `EventBus` in `server/events/`. Services publish events (e.g., `candidateCreated`, `taskAssigned`) that trigger notifications and side effects.

### Authorization
Role-based + scope-based (department/division). Six roles: `system_admin`, `hr_staff`, `department_admin`, `division_leader`, `manager`, `candidate`. Use `authorizationService.getAuthContext(req.user)` for scope-aware queries.

### Multi-Provider Authentication
- Local authentication with bcrypt/scrypt
- LDAP integration (ldapjs)
- OAuth providers (Google, Azure AD) via Passport.js
- Auth code in `server/features/auth/`
- Password utilities in `server/utils/passwords.ts` (hashing, comparison)

## Key Patterns

### Request Validation
Use validation middleware from `server/middleware/validation.ts` for consistent error handling:
```typescript
import { validateBody, isZodError, handleZodError } from '../middleware/validation';
import { insertCandidateSchema } from '@shared/schemas';

// Option 1: Use validateBody middleware for simple validation
router.post("/items", validateBody(insertItemSchema), async (req, res, next) => {
  const validatedData = req.validatedBody as typeof insertItemSchema._type;
  // ... use validatedData
});

// Option 2: Use isZodError helper for complex flows (e.g., .partial(), additional logic)
router.patch("/items/:id", async (req, res, next) => {
  try {
    const validatedData = schema.partial().parse(req.body);
    // ... business logic
  } catch (error) {
    if (isZodError(error)) {
      return handleZodError(res, error);
    }
    next(error);
  }
});
```

### Password Security
Use shared utilities from `server/utils/passwords.ts`:
```typescript
import { hashPassword, comparePasswords, validatePasswordPolicy } from '../utils/passwords';

// Hash a new password
const hash = await hashPassword(plaintext);

// Verify a password (supports bcrypt and scrypt, constant-time comparison)
const isValid = await comparePasswords(supplied, stored);

// Validate password policy
const errors = validatePasswordPolicy(password); // 12+ chars, mixed case, number, special char
```

### Logging
Use environment-aware logger from `server/utils/logger.ts` instead of `console.log`:
```typescript
import { logger } from '../utils/logger';

logger.debug('Detailed info', { key: 'value' });  // Dev only, silent in prod/test
logger.info('Operation completed', { count: 5 }); // Always visible
logger.warn('Deprecated API used');               // Always visible
logger.error('Failed to connect', error);         // Always visible, includes stack in dev
```

Log levels: `LOG_LEVEL=debug|info|warn|error|silent` (defaults: `debug` in dev, `info` in prod, `silent` in test).

### Service Factory (DI)
Services instantiated via `server/services/service-factory.ts`. Use `get*Service()` in routes:
```typescript
const candidateService = getCandidateService();
```

### Client Data Fetching
TanStack Query with `apiRequest()` from `client/src/lib/queryClient.ts`. CSRF tokens auto-attached. Query keys use API paths: `["/api/candidates"]`.

### Form Handling
```typescript
const form = useForm({ resolver: zodResolver(insertCandidateSchema) });
```

## Testing

```bash
npm test              # Run all tests (backend + frontend)
npm run test:backend  # Node test runner via tsx
npm run test:frontend # Vitest with happy-dom
npm run test:watch    # Vitest watch mode
npm run test:coverage # Coverage reporting
```

### Backend Testing
- Node.js built-in test runner via tsx
- Use `MockServiceFactory` for mocking services
- Use `testAgent({ role: 'system_admin' })` for authenticated API tests
- Use `setServiceFactoryForTesting()` / `resetServiceFactory()` for isolation
- Fixtures via `seedAuthorizationFixtures()`

**Test locations:**
- `server/tests/auth/` - Auth tests
- `server/tests/routes/` - API integration tests
- `server/tests/services/` - Service unit tests

### Frontend Testing
- Vitest + happy-dom + @testing-library/react
- Setup in `client/tests/setup.ts`
- Tests in `client/tests/`, `client/src/**/*.test.{ts,tsx}`

## File Structure
- Routes: `server/routes/{domain}.routes.ts`
- Services: `server/services/{domain}/{service-name}.service.ts`
- Repositories: `server/repositories/{category}/{EntityRepository}.ts`
- Client pages: `client/src/app/(dashboard)/{route}/page.tsx`
- UI components: `client/src/shared/components/ui/`

## Domain Concepts
- **Template Application**: Templates define reusable workflows (stages + tasks). Applied to candidates to materialize tasks.
- **Candidate Stage**: Current pipeline step via `currentStageId` with history.
- **Due Rules**: Task due dates relative to anchor dates (LOI, LOO, start date) via `TaskDueDateService`.
- **Notifications**: Stored in DB, delivered via UI polling + email outbox jobs.

## Path Aliases
- `@` → `client/src`
- `@shared` → `shared`
- `@db` → database

## API Documentation
OpenAPI spec at `server/docs/openapi-spec.ts`. Swagger UI at `/api/docs`.

## Consistency Rules
- Reuse existing components, hooks, forms, and utilities
- Only extend when needed—never replace or invent new patterns unless no suitable option exists
- Follow existing naming conventions and file organization
- Maintain full consistency with the current system
- Ensure all new code is fully typed with TypeScript
- First, comprehensively review and plan. Then make a to-do list. Review it, and check off that to-do list after every fix. If confused about anything, ask questions before making changes.
