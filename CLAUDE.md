# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Build and Development:**
- `npm run dev` - Start development server
- `npm run build` - Build for production 
- `npm start` - Start production server
- `npm run check` - Run TypeScript checking

**Database:**
- `npm run db:push` - Push schema changes to database
- `npm run db:import` - Import database export from `database_export.sql`
- `npm run user:set-password` - Set user password using script

**Docker:**
- `docker-compose up` - Start PostgreSQL 16 database locally

## Project Architecture

**Full-Stack Structure:**
- **Frontend:** React 18 + TypeScript in `/client/src/`
- **Backend:** Express.js server in `/server/`  
- **Database:** PostgreSQL with Drizzle ORM
- **Shared:** Common schemas and types in `/shared/`

**Frontend Architecture:**
- **Router:** Wouter for client-side routing
- **State:** TanStack Query for server state, React hooks for local state
- **UI:** Radix UI components with custom styling in `/client/src/components/ui/`
- **Styling:** TailwindCSS with custom design system
- **Layout:** Responsive design with mobile-first sidebar navigation

**Backend Architecture:**
- **API:** RESTful endpoints registered in `server/routes.ts`
- **Database:** Drizzle ORM with comprehensive schema in `shared/schema.ts`
- **Auth:** Multi-provider authentication (local, LDAP, OAuth) in `server/auth/`
- **Services:** Business logic in `server/services/`

**Database Design:**
Core entities include users, candidates, templates, tasks, and hiring stages with complex relationships for hiring workflow management. Features multi-provider authentication, role-based access, and template-based candidate onboarding.

## Key Features

**Hiring Pipeline Management:**
- Candidate tracking through multiple hiring stages
- Template-based workflows with stage-specific tasks
- Task assignment and status tracking
- Role-based permissions (system_admin, hr_staff, managers, etc.)

**Multi-Provider Authentication:**
- Local authentication with bcrypt
- LDAP integration for enterprise
- OAuth providers (Google, Azure AD)
- User identity management across providers

**Responsive UI:**
- Mobile-first responsive design
- Searchable dropdowns with auto-complete
- Drag-and-drop functionality for stage reordering
- Dark/light theme support

## Important File Locations

**Configuration:**
- `vite.config.ts` - Vite build configuration with path aliases
- `tailwind.config.ts` - TailwindCSS configuration
- `drizzle.config.ts` - Database configuration
- `docker-compose.yml` - Local PostgreSQL setup

**Core Application:**
- `client/src/App.tsx` - Main React application with routing
- `server/index.ts` - Express server entry point
- `shared/schema.ts` - Complete database schema and types
- `server/auth/` - Authentication system

**Database:**
- All database operations use Drizzle ORM
- Schema defined in `shared/schema.ts`
- Migrations in `/migrations/`
- Local development uses PostgreSQL via Docker

## Development Notes

**Environment Setup:**
- Requires `DATABASE_URL` environment variable
- Uses different SSL settings for Neon vs local PostgreSQL
- Development server runs on port 5000 by default with fallback ports

**Code Style:**
- TypeScript throughout with strict mode
- Zod schemas for validation
- Comprehensive error handling with custom error types
- Path aliases: `@/` for client src, `@shared/` for shared code

**Testing:**
- No specific test framework mentioned - check for existing test setup before adding tests