/**
 * Organization Service
 *
 * Business logic layer for organizational structure management.
 * Handles departments and divisions (organizational units).
 */

import type { Department, Division, InsertDepartment, InsertDivision } from "@shared/schemas";
import type { DepartmentRepository } from "../../repositories/organizational/DepartmentRepository";
import type { DivisionRepository, ManagerInfo } from "../../repositories/organizational/DivisionRepository";

/**
 * Service for organization-related business operations
 */
export class OrganizationService {
  constructor(
    private departmentRepo: DepartmentRepository,
    private divisionRepo: DivisionRepository
  ) {}

  // ==================== Departments ====================

  /**
   * Get all departments
   */
  async getDepartments(includeArchived: boolean = false): Promise<Department[]> {
    return this.departmentRepo.getDepartments(includeArchived);
  }

  /**
   * Create a new department
   */
  async createDepartment(input: InsertDepartment): Promise<Department> {
    return this.departmentRepo.createDepartment(input);
  }

  /**
   * Update a department
   */
  async updateDepartment(id: string, data: Partial<InsertDepartment>): Promise<Department | undefined> {
    return this.departmentRepo.updateDepartment(id, data);
  }

  /**
   * Archive a department (soft delete)
   */
  async archiveDepartment(id: string): Promise<Department | undefined> {
    return this.departmentRepo.updateDepartment(id, { archived: true, updatedAt: new Date() });
  }

  /**
   * Restore an archived department
   */
  async restoreDepartment(id: string): Promise<Department | undefined> {
    return this.departmentRepo.updateDepartment(id, { archived: false, updatedAt: new Date() });
  }

  // ==================== Divisions ====================

  /**
   * Get divisions with optional filtering by department
   */
  async getDivisions(departmentId?: string, includeArchived: boolean = false): Promise<Division[]> {
    return this.divisionRepo.getDivisions(departmentId, includeArchived);
  }

  /**
   * Create a new division
   */
  async createDivision(input: InsertDivision): Promise<Division> {
    return this.divisionRepo.createDivision(input);
  }

  /**
   * Update a division
   */
  async updateDivision(id: string, data: Partial<InsertDivision>): Promise<Division | undefined> {
    return this.divisionRepo.updateDivision(id, data);
  }

  /**
   * Archive a division (soft delete)
   */
  async archiveDivision(id: string): Promise<Division | undefined> {
    return this.divisionRepo.updateDivision(id, { archived: true, updatedAt: new Date() });
  }

  /**
   * Restore an archived division
   */
  async restoreDivision(id: string): Promise<Division | undefined> {
    return this.divisionRepo.updateDivision(id, { archived: false, updatedAt: new Date() });
  }

  /**
   * Get divisions within a department with search and pagination
   */
  async getDivisionsByDepartment(
    departmentId: string,
    searchQuery?: string,
    limit?: number,
    offset?: number
  ): Promise<Division[]> {
    return this.divisionRepo.getDivisionsByDepartment(departmentId, searchQuery, limit, offset);
  }

  /**
   * Get managers within a department or division
   * Returns users with manager role for assignment purposes
   */
  async getManagersByDepartment(
    departmentId: string,
    divisionId?: string,
    searchQuery?: string,
    limit?: number,
    offset?: number
  ): Promise<ManagerInfo[]> {
    return this.divisionRepo.getManagersByDepartment(departmentId, divisionId, searchQuery, limit, offset);
  }
}
