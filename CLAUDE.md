# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Build and Development:**
- `npm run dev` - Start development server (Vite + Express)
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run check` - Run TypeScript checking

**Database:**
- `npm run db:push` - Push schema changes to database
- `npm run db:import` - Import database export from `database_export.sql`
- `npm run user:set-password` - Set user password using script

**Docker:**
- `docker-compose up` - Start PostgreSQL 16 database locally (port 5432)

## Project Architecture

**Full-Stack Structure:**
- **Frontend:** React 18 + TypeScript in `/client/src/`
- **Backend:** Express.js server in `/server/`
- **Database:** PostgreSQL with Drizzle ORM
- **Shared:** Common schemas and types in `/shared/`

**Frontend Architecture:**
- **Router:** Wouter for client-side routing
- **State:** TanStack Query for server state, React hooks for local state
- **UI:** Radix UI components with shadcn/ui patterns in `/client/src/components/ui/`
- **Styling:** TailwindCSS with custom design system
- **Layout:** Responsive design with mobile-first sidebar navigation
- **Forms:** React Hook Form with Zod validation

**Backend Architecture:**
- **API:** RESTful endpoints registered in `server/routes.ts`
- **Database:** Drizzle ORM with PostgreSQL (neon-serverless for production)
- **Auth:** Multi-provider authentication (local, LDAP, OAuth) in `server/auth/`
- **Services:** Business logic in `server/services/`
- **Session:** Express-session with connect-pg-simple for session storage

**Database Design:**
Core entities include:
- **Users & Auth:** users, userIdentities (multi-provider), sessions
- **Candidates:** candidates with hiring workflow tracking
- **Templates:** templates, templateStages, templateTasks for workflow definitions
- **Tasks:** tasks, taskAssignments for candidate-specific work items
- **Hiring Pipeline:** hiringStages for candidate progression
- **Collaboration:** comments, notifications, activityLog for team communication
- **Settings:** authProviders, systemSettings for configuration

## Key Features

**Hiring Pipeline Management:**
- Candidate tracking through multiple hiring stages
- Template-based workflows with stage-specific tasks
- Task assignment and status tracking
- Drag-and-drop stage reordering
- Activity logging and audit trail

**Multi-Provider Authentication:**
- Local authentication with bcrypt (argon2 support)
- LDAP integration for enterprise (ldapjs)
- OAuth providers (Google, Azure AD) via Passport.js
- User identity management across providers
- Password reset functionality

**Responsive UI:**
- Mobile-first responsive design
- Searchable dropdowns with auto-complete (cmdk)
- Rich text editing (TipTap)
- Date picking (react-day-picker)
- Toast notifications (sonner)
- Dark/light theme support

**Additional Features:**
- PDF generation (jspdf)
- CSV export capabilities
- Real-time notifications
- Comment system with mentions
- Role-based access control

## Important File Locations

**Configuration:**
- `vite.config.ts` - Vite build configuration with path aliases
- `tailwind.config.ts` - TailwindCSS configuration
- `drizzle.config.ts` - Database configuration
- `docker-compose.yml` - Local PostgreSQL setup
- `tsconfig.json` - TypeScript configuration

**Core Application:**
- `client/src/App.tsx` - Main React application with routing
- `client/src/main.tsx` - React entry point
- `server/index.ts` - Express server entry point
- `server/routes.ts` - API route definitions
- `shared/schema.ts` - Complete database schema and types

**Authentication:**
- `server/auth/` - Authentication strategies and middleware
- `server/auth/local.ts` - Local authentication
- `server/auth/ldap.ts` - LDAP integration
- `server/auth/oauth.ts` - OAuth providers

**UI Components:**
- `client/src/components/ui/` - Reusable UI components (shadcn/ui)
- `client/src/components/` - Feature-specific components
- `client/src/hooks/` - Custom React hooks
- `client/src/lib/` - Utility functions

**Database:**
- `shared/schema.ts` - Drizzle schema definitions
- `server/db.ts` - Database connection setup
- `migrations/` - Database migrations

## Development Notes

**Environment Setup:**
- Requires `DATABASE_URL` environment variable
- Uses neon-serverless for production PostgreSQL
- Local development uses PostgreSQL via Docker (port 5432)
- Development server runs on port 5000 with fallback ports

**Code Style:**
- TypeScript throughout with strict mode
- Zod schemas for API validation (shared between client/server)
- Comprehensive error handling with custom error types
- Path aliases: `@/` for client src, `@shared/` for shared code, `@db` for database

**Key Dependencies:**
- **Frontend:** React 18, TanStack Query, Wouter, TailwindCSS, Radix UI
- **Backend:** Express, Drizzle ORM, Passport.js, express-session
- **Shared:** Zod, date-fns

## Testing

**Test Commands:**
- `npm test` - Run all tests (backend + frontend)
- `npm run test:backend` - Run backend tests with tsx/Node test runner
- `npm run test:frontend` - Run frontend tests with Vitest
- `npm run test:auth` - Run authentication tests only
- `npm run test:routes` - Run route tests only
- `npm run test:db` - Run database tests only
- `npm run test:watch` - Run Vitest in watch mode
- `npm run test:ui` - Run Vitest with interactive UI
- `npm run test:coverage` - Run tests with coverage reporting

**Test Frameworks:**
- **Frontend:** Vitest with happy-dom environment
- **Backend:** Node.js built-in test runner via tsx
- **Assertions:** Vitest expect + @testing-library/jest-dom matchers
- **HTTP Testing:** Supertest for API integration tests

**Frontend Test Setup (`client/tests/setup.ts`):**
- @testing-library/react for component testing
- jest-dom matchers for DOM assertions
- Auto-cleanup after each test
- Mocks for matchMedia, IntersectionObserver, ResizeObserver, scrollIntoView

**Frontend Test Locations:**
- `client/tests/` - General frontend tests
- `client/src/lib/*.test.ts` - Utility function tests
- `client/src/shared/hooks/*.test.tsx` - Hook tests
- `client/src/shared/components/ui/*.test.tsx` - UI component tests
- `client/src/features/**/*.test.ts` - Feature-specific tests

**Backend Test Setup:**
- `server/tests/utils/testAgent.ts` - Authenticated test agent with supertest
- `server/tests/utils/mockServiceFactory.ts` - In-memory mock service factory
- `server/tests/utils/testEnvironment.ts` - Test environment configuration
- `server/tests/utils/seedAuthorizationFixtures.ts` - Authorization test fixtures

**Backend Test Locations:**
- `server/tests/auth/` - Authentication and authorization tests
- `server/tests/routes/` - API route integration tests
- `server/tests/services/` - Service layer unit tests
- `server/tests/repositories/` - Repository layer tests
- `server/tests/events/` - EventBus tests
- `server/tests/api/` - API integration tests

**Test Configuration:**
- `vitest.config.ts` - Vitest configuration (frontend)
- Coverage via v8 provider with text, json, html reporters
- Test files match `**/*.{test,spec}.{ts,tsx}` pattern

**Writing Tests:**
- Use `MockServiceFactory` for mocking backend services
- Use `testAgent({ role: 'system_admin' })` for authenticated API tests
- Use `setServiceFactoryForTesting()` / `resetServiceFactory()` for test isolation
- Frontend tests use `@testing-library/react` patterns

## Maintain Consistency
- Reuse existing components, hooks, forms, and utilities
- Only extend them when needed, never replace or invent new patterns unless no suitable option exists
- Maintain full consistency with the current system
- Follow existing naming conventions and file organization