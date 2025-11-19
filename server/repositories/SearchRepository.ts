/**
 * Search Repository
 *
 * Provides fuzzy search functionality using PostgreSQL trigram similarity.
 * Searches across departments, divisions, and users with relevance scoring.
 *
 * The trigram similarity method splits text into three-character sequences
 * and measures how many trigrams are shared between the search query and
 * database values, providing effective fuzzy matching for typos and
 * partial matches.
 */

import { sql } from "drizzle-orm";
import { BaseRepository } from "./base/BaseRepository";
import type { db as DbType } from "../db/connection";
import type { Pool } from "pg";

/**
 * Search result with relevance score
 */
export interface SearchResult {
  /** ID of the matched entity */
  id: string;
  /** Name/display text of the matched entity */
  name: string;
  /** Relevance score (0-1, higher is better match) */
  score?: number;
}

export class SearchRepository extends BaseRepository {
  constructor(db: typeof DbType, pool: Pool) {
    super(db, pool);
  }

  /**
   * Search departments using trigram similarity
   *
   * Uses PostgreSQL's similarity() function to find departments that match
   * the query string. Supports fuzzy matching with a threshold of 0.1.
   * Returns up to 20 results ordered by relevance score.
   *
   * @param query - Search query string
   * @returns Promise resolving to array of department search results
   *
   * @example
   * ```ts
   * // Find departments matching "eng"
   * const results = await searchRepo.searchDepartments("eng");
   * // Returns: [{ id: "...", name: "Engineering", score: 0.85 }, ...]
   * ```
   */
  async searchDepartments(query: string): Promise<SearchResult[]> {
    const results = await this.db.execute(sql`
      WITH qry AS (
        SELECT nullif(trim(${query}), '') AS q
      )
      SELECT id, name,
             CASE WHEN (SELECT q FROM qry) IS NULL THEN 1.0
                  ELSE GREATEST(similarity(lower(name), lower((SELECT q FROM qry))), 0)
             END AS score
      FROM departments
      WHERE archived = false
        AND (
          (SELECT q FROM qry) IS NULL
          OR name ILIKE '%' || (SELECT q FROM qry) || '%'
          OR similarity(lower(name), lower((SELECT q FROM qry))) > 0.1
        )
      ORDER BY
        CASE WHEN (SELECT q FROM qry) IS NULL THEN 0 ELSE 1 END,
        score DESC,
        name ASC
      LIMIT 20
    `);

    return results.rows.map((r: any) => ({
      id: r.id as string,
      name: r.name as string,
      score: r.score as number
    }));
  }

  /**
   * Search divisions using trigram similarity
   *
   * Uses PostgreSQL's similarity() function to find divisions that match
   * the query string. Optionally filters by department.
   * Supports fuzzy matching with a threshold of 0.1.
   * Returns up to 20 results ordered by relevance score.
   *
   * @param query - Search query string
   * @param departmentId - Optional department ID to filter results
   * @returns Promise resolving to array of division search results
   *
   * @example
   * ```ts
   * // Find divisions matching "soft"
   * const results = await searchRepo.searchDivisions("soft");
   * // Returns: [{ id: "...", name: "Software Engineering", score: 0.72 }, ...]
   *
   * // Find divisions in specific department matching "soft"
   * const deptResults = await searchRepo.searchDivisions("soft", "dept-123");
   * ```
   */
  async searchDivisions(query: string, departmentId?: string): Promise<SearchResult[]> {
    const results = await this.db.execute(sql`
      WITH qry AS (
        SELECT nullif(trim(${query}), '') AS q, ${departmentId || null}::uuid AS dept_id
      )
      SELECT id, name,
             CASE WHEN (SELECT q FROM qry) IS NULL THEN 1.0
                  ELSE GREATEST(similarity(lower(name), lower((SELECT q FROM qry))), 0)
             END AS score
      FROM divisions
      WHERE archived = false
        AND ((SELECT dept_id FROM qry) IS NULL OR department_id = (SELECT dept_id FROM qry))
        AND (
          (SELECT q FROM qry) IS NULL
          OR name ILIKE '%' || (SELECT q FROM qry) || '%'
          OR similarity(lower(name), lower((SELECT q FROM qry))) > 0.1
        )
      ORDER BY
        CASE WHEN (SELECT q FROM qry) IS NULL THEN 0 ELSE 1 END,
        score DESC,
        name ASC
      LIMIT 20
    `);

    return results.rows.map((r: any) => ({
      id: r.id as string,
      name: r.name as string,
      score: r.score as number
    }));
  }

  /**
   * Search users using trigram similarity
   *
   * Uses PostgreSQL's similarity() function to find users that match
   * the query string against their full name (first name + last name).
   * Supports filtering by role, department, and division.
   * Uses fuzzy matching with a threshold of 0.1.
   * Returns up to 20 active users ordered by relevance score.
   *
   * @param query - Search query string (matches against full name)
   * @param role - Optional role filter (e.g., 'manager', 'hr_staff')
   * @param departmentId - Optional department ID filter
   * @param divisionId - Optional division ID filter (takes precedence over departmentId)
   * @returns Promise resolving to array of user search results
   *
   * @example
   * ```ts
   * // Find all users matching "john"
   * const results = await searchRepo.searchUsers("john");
   *
   * // Find managers matching "smith" in a department
   * const managers = await searchRepo.searchUsers("smith", "manager", "dept-123");
   *
   * // Find users in a specific division
   * const divUsers = await searchRepo.searchUsers("", undefined, undefined, "div-456");
   * ```
   */
  async searchUsers(query: string, role?: string, departmentId?: string, divisionId?: string): Promise<SearchResult[]> {
    const results = await this.db.execute(sql`
      WITH params AS (
        SELECT
          NULLIF(${query}, '')::text AS q,
          NULLIF(${role || ''}, '')::text AS role,
          NULLIF(${departmentId || ''}, '')::uuid AS department_id,
          NULLIF(${divisionId || ''}, '')::uuid AS division_id
      )
      SELECT u.id,
             u.first_name || ' ' || u.last_name AS name,
             CASE
               WHEN (SELECT q FROM params) IS NULL THEN 1.0
               ELSE GREATEST(similarity(lower(u.first_name || ' ' || u.last_name), lower((SELECT q FROM params))), 0)
             END AS score
      FROM users u, params p
      WHERE u.status = 'active'
        AND (p.role IS NULL OR u.role::text = p.role)
        AND (
          p.division_id IS NOT NULL AND u.division_id = p.division_id
          OR (p.division_id IS NULL AND (p.department_id IS NULL OR u.department_id = p.department_id))
        )
        AND (
          p.q IS NULL
          OR u.first_name ILIKE '%' || p.q || '%'
          OR u.last_name ILIKE '%' || p.q || '%'
          OR (u.first_name || ' ' || u.last_name) ILIKE '%' || p.q || '%'
          OR similarity(lower(u.first_name || ' ' || u.last_name), lower(p.q)) > 0.1
        )
      ORDER BY
        CASE WHEN (SELECT q FROM params) IS NULL THEN 0 ELSE 1 END,
        score DESC,
        u.first_name || ' ' || u.last_name ASC
      LIMIT 20
    `);

    return results.rows.map((r: any) => ({
      id: r.id as string,
      name: r.name as string,
      score: r.score as number
    }));
  }
}
