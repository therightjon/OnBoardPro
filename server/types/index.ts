/**
 * Central Type Exports
 *
 * This file re-exports shared types from their canonical locations
 * for convenient importing across the application.
 */

// Core authorization and scope types
export type {
  AuthorizationContext,
  CandidateScopeFilters,
  DivisionActiveCandidateSummary,
  TemplateExpansionTask,
  TemplateExpansionResult,
  DecodedCursor,
} from "../repositories/base/types";

// Dashboard types
export type {
  RecentActivityEventType,
  RecentActivityEvent,
} from "../services/dashboard/dashboard.service";

// Auth types
export type { LdapSettings } from "../services/auth/auth-provider.service";
