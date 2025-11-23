/**
 * Base Repository Class
 *
 * Provides common functionality for all repository classes including
 * cursor-based pagination, scope filtering, and shared query patterns.
 */

import { eq, and, or, inArray, sql } from "drizzle-orm";
import { candidates } from "@shared/schemas";
import type { db as DbType } from "../../db/connection";
import type { Pool } from "pg";
import type {
  DecodedCursor,
  CandidateScopeFilters,
  AuthorizationContext
} from "./types";

export class BaseRepository {
  protected readonly db: typeof DbType;
  protected readonly pool: Pool;

  constructor(db: typeof DbType, pool: Pool) {
    this.db = db;
    this.pool = pool;
  }

  /**
   * Decode a base64 cursor into its component parts
   * @param cursor - Base64 encoded cursor
   * @returns Decoded cursor or undefined if invalid
   */
  protected decodeCursor(cursor?: string): DecodedCursor | undefined {
    if (!cursor) return undefined;
    try {
      const raw = Buffer.from(cursor, 'base64').toString('utf8');
      const obj = JSON.parse(raw);
      return { createdAt: new Date(obj.createdAt), id: obj.id };
    } catch {
      return undefined;
    }
  }

  /**
   * Encode a row's createdAt and id into a base64 cursor
   * @param row - Row with createdAt and id fields
   * @returns Base64 encoded cursor
   */
  protected encodeCursor(row: { createdAt: Date; id: string }): string {
    return Buffer.from(
      JSON.stringify({
        createdAt: row.createdAt.toISOString(),
        id: row.id
      })
    ).toString('base64');
  }

  /**
   * Apply scope filters to a where conditions array
   * Used for authorization-based filtering of candidates
   *
   * @param whereConditions - Array of where conditions to append to
   * @param filters - Scope filters to apply
   * @param requireScope - If true, add false condition when no scopes match
   */
  protected applyScopeFilters(
    whereConditions: any[],
    filters: CandidateScopeFilters,
    requireScope = false
  ): void {
    const scopeConditions: any[] = [];
    const departmentIds = filters.departmentIds ? Array.from(new Set(filters.departmentIds)) : [];
    const divisionIds = filters.divisionIds ? Array.from(new Set(filters.divisionIds)) : [];
    const managerIds = filters.managerIds ? Array.from(new Set(filters.managerIds)) : [];
    const candidateIds = filters.candidateIds ? Array.from(new Set(filters.candidateIds)) : [];
    const linkedUserIds = filters.linkedUserIds ? Array.from(new Set(filters.linkedUserIds)) : [];

    if (departmentIds.length > 0) {
      scopeConditions.push(inArray(candidates.departmentId, departmentIds as string[]));
    }
    if (divisionIds.length > 0) {
      scopeConditions.push(inArray(candidates.divisionId, divisionIds as string[]));
    }
    if (managerIds.length > 0) {
      scopeConditions.push(inArray(candidates.managerId, managerIds as string[]));
    }
    if (candidateIds.length > 0) {
      scopeConditions.push(inArray(candidates.id, candidateIds as string[]));
    }
    if (linkedUserIds.length > 0) {
      scopeConditions.push(inArray(candidates.linkedUserId, linkedUserIds as string[]));
    }

    if (scopeConditions.length > 0) {
      if (scopeConditions.length === 1) {
        whereConditions.push(scopeConditions[0]);
      } else {
        whereConditions.push(or(...scopeConditions));
      }
    } else if (requireScope) {
      // No scopes match - return empty result set
      whereConditions.push(sql`false`);
    }
  }

  /**
   * Build a candidate visibility checker function based on authorization context
   * Returns a function that checks if a candidate is visible to the user
   *
   * @param auth - Authorization context
   * @returns Function that checks candidate visibility
   */
  protected buildCandidateVisibilityChecker(
    auth?: AuthorizationContext
  ): (candidate: any) => boolean {
    if (!auth || auth.privileged) {
      // Privileged users see everything
      return () => true;
    }

    return (candidate: any) => {
      // Check if user is the linked user (candidate themselves)
      if (auth.userId && candidate.linkedUserId === auth.userId) {
        return true;
      }
      // Check if user is the manager
      if (auth.userId && candidate.managerId === auth.userId) {
        return true;
      }
      // Check department scope
      if (candidate.departmentId && auth.departmentIds.has(candidate.departmentId)) {
        return true;
      }
      // Check division scope
      if (candidate.divisionId && auth.divisionIds.has(candidate.divisionId)) {
        return true;
      }
      // Check managed candidate scope
      if (candidate.id && auth.managedCandidateIds.has(candidate.id)) {
        return true;
      }
      return false;
    };
  }

  /**
   * Execute a function within a database transaction
   * @param callback - Function to execute within transaction
   * @returns Result of the callback
   */
  protected async transaction<T>(
    callback: (tx: typeof DbType) => Promise<T>
  ): Promise<T> {
    return this.db.transaction(callback as any);
  }
}
