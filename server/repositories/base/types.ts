/**
 * Base Repository Types
 *
 * Shared types used across all repository classes
 */

import type { Express } from "express";

/**
 * Authorization context for a user
 * Contains all authorization-related information needed for access control
 */
export interface AuthorizationContext {
  /** User ID or null if not authenticated */
  userId: string | null;
  /** Set of user roles */
  roles: Set<string>;
  /** Department IDs the user has access to */
  departmentIds: Set<string>;
  /** Division IDs the user has access to */
  divisionIds: Set<string>;
  /** Candidate IDs the user can manage */
  managedCandidateIds: Set<string>;
  /** Whether user has privileged roles (system_admin, hr_staff, etc.) */
  privileged: boolean;
  /** Whether user is a candidate */
  isCandidate: boolean;
}

/**
 * Filters for scoping candidate queries based on authorization
 */
export interface CandidateScopeFilters {
  /** Filter by department IDs */
  departmentIds?: Iterable<string>;
  /** Filter by division IDs */
  divisionIds?: Iterable<string>;
  /** Filter by manager IDs */
  managerIds?: Iterable<string>;
  /** Filter by candidate IDs */
  candidateIds?: Iterable<string>;
  /** Filter by linked user IDs */
  linkedUserIds?: Iterable<string>;
}

/**
 * Division summary with active candidate counts
 */
export interface DivisionActiveCandidateSummary {
  divisionId: string;
  divisionName: string;
  departmentId: string;
  departmentName: string;
  activeCandidateCount: number;
}

/**
 * Template expansion task result
 */
export interface TemplateExpansionTask {
  id: string;
  candidateId: string;
  assigneeUserId: string | null;
  assigneeKind: 'user' | 'role';
  assigneeRole: string | null;
  title: string;
  status: string;
  dueAt: Date | null;
  pendingAnchor: boolean;
}

/**
 * Template expansion result
 */
export interface TemplateExpansionResult {
  createdCount: number;
  createdTasks: TemplateExpansionTask[];
}

/**
 * Cursor-based pagination options
 */
export interface CursorPaginationOptions {
  /** Maximum number of items to return */
  limit?: number;
  /** Cursor for pagination (base64 encoded) */
  cursor?: string;
}

/**
 * Decoded cursor for pagination
 */
export interface DecodedCursor {
  createdAt: Date;
  id: string;
}

/**
 * Paginated response with cursor
 */
export interface PaginatedResponse<T> {
  items: T[];
  nextCursor?: string;
  hasMore: boolean;
}

/**
 * Common filter options for list queries
 */
export interface BaseListFilters {
  /** Search query */
  search?: string;
  /** Pagination limit */
  limit?: number;
  /** Pagination offset */
  offset?: number;
  /** Include archived items */
  includeArchived?: boolean;
}
