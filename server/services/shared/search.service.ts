/**
 * Search Service
 *
 * Business logic layer for search functionality.
 * Provides fuzzy search across departments, divisions, and users.
 */

import type { SearchRepository, SearchResult } from "../../repositories/SearchRepository";

export interface SearchUsersOptions {
  role?: string;
  departmentId?: string;
  divisionId?: string;
}

/**
 * Service for search-related business operations
 */
export class SearchService {
  constructor(
    private searchRepo: SearchRepository
  ) {}

  /**
   * Search departments by name using trigram similarity
   */
  async searchDepartments(query: string): Promise<SearchResult[]> {
    return this.searchRepo.searchDepartments(query);
  }

  /**
   * Search divisions by name using trigram similarity
   */
  async searchDivisions(query: string, departmentId?: string): Promise<SearchResult[]> {
    return this.searchRepo.searchDivisions(query, departmentId);
  }

  /**
   * Search users by name using trigram similarity
   * Supports filtering by role, department, and division
   */
  async searchUsers(query: string, options?: SearchUsersOptions): Promise<SearchResult[]> {
    return this.searchRepo.searchUsers(
      query,
      options?.role,
      options?.departmentId,
      options?.divisionId
    );
  }

  /**
   * Combined search across multiple entity types
   * Useful for global search functionality
   */
  async searchAll(query: string): Promise<{
    departments: SearchResult[];
    divisions: SearchResult[];
    users: SearchResult[];
  }> {
    const [departments, divisions, users] = await Promise.all([
      this.searchDepartments(query),
      this.searchDivisions(query),
      this.searchUsers(query)
    ]);

    return { departments, divisions, users };
  }
}
