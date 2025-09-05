# OnboardPro - Hiring and Onboarding Application

## Overview

OnboardPro is a comprehensive hiring and onboarding management system designed to streamline the process of bringing new employees into an organization. The application provides role-based access control for different stakeholders in the hiring process, from system administrators to candidates themselves. It features candidate management, task tracking, template-based workflows, and analytics capabilities to ensure smooth onboarding experiences.

The system is built around a workflow-driven approach where candidates progress through different hiring stages, with tasks assigned to various team members based on their roles and responsibilities. Templates allow for standardized onboarding processes that can be applied consistently across different departments and divisions.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The client-side application is built using modern React with TypeScript, leveraging Vite as the build tool for fast development and optimized production builds. The UI framework is based on shadcn/ui components with Radix UI primitives, providing a consistent and accessible design system. TailwindCSS is used for styling with a custom theme supporting both light and dark modes.

The application follows a component-based architecture with a clear separation between pages, reusable UI components, and business logic. State management is handled through TanStack Query for server state and React's built-in state management for local component state. The routing system uses Wouter for client-side navigation with protected routes for authenticated users.

### Backend Architecture
The server is built on Express.js with TypeScript, following a REST API pattern. The application uses a modular structure with separate files for authentication, database operations, routing, and storage logic. Session-based authentication is implemented using Passport.js with local strategy and PostgreSQL session storage.

The backend implements role-based access control (RBAC) with six distinct roles: system_admin, hr_staff, department_admin, division_leader, manager, and candidate. Each role has specific permissions and access levels to different parts of the application, enforced through middleware functions.

### Database Design
The application uses PostgreSQL as the primary database with Drizzle ORM for type-safe database operations. The schema includes comprehensive tables for users, departments, divisions, candidates, tasks, templates, and various reference data. All tables follow consistent patterns with UUID primary keys and timestamp fields for auditing.

Key relationships include hierarchical department/division structures, candidate assignments to managers and departments, task assignments with due dates and priorities, and template-based task generation. The database supports complex workflows with stage tracking and candidate progression through different hiring phases.

### Authentication and Authorization
Authentication is handled through session-based login using bcrypt for password hashing and Express sessions with PostgreSQL storage. The system implements a seven-day session expiry with secure cookie settings for production environments.

Authorization follows an RBAC model where permissions are checked at both the route level and within business logic. Each role has specific capabilities ranging from full system access for administrators to restricted self-service access for candidates.

### Component Architecture
The frontend follows a structured component hierarchy with shared UI components in the components/ui directory, layout components for navigation and theming, and page-specific components organized by feature. The application uses React Hook Form with Zod validation for form handling and type safety.

## External Dependencies

### Database Services
- **PostgreSQL 16**: Primary database engine hosted on Neon Database platform
- **Drizzle ORM**: Type-safe database toolkit with migration support
- **connect-pg-simple**: PostgreSQL session store for Express sessions

### UI and Design System
- **Radix UI**: Headless UI component library providing accessibility primitives
- **shadcn/ui**: Pre-built component library built on Radix UI
- **TailwindCSS**: Utility-first CSS framework for styling
- **Lucide React**: Icon library for consistent iconography

### Development and Build Tools
- **Vite**: Fast build tool and development server
- **TypeScript**: Static type checking and enhanced developer experience
- **ESBuild**: Fast JavaScript bundler for production builds
- **PostCSS**: CSS processing tool with Autoprefixer plugin

### Runtime and Hosting
- **Node.js**: JavaScript runtime environment
- **Express.js**: Web application framework
- **Passport.js**: Authentication middleware with local strategy
- **bcrypt**: Password hashing library for secure authentication

### State Management and Data Fetching
- **TanStack Query**: Server state management and caching
- **React Hook Form**: Form handling and validation
- **Zod**: Schema validation for type-safe data handling

### Session and Security
- **Express Session**: Session management middleware
- **CORS**: Cross-origin resource sharing configuration
- **Helmet**: Security middleware for HTTP headers