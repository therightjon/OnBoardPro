/**
 * Organization Service
 *
 * Business logic layer for organizational structure management.
 * Handles departments and divisions (organizational units).
 */

import type { Department, Division, InsertDepartment, InsertDivision } from "@shared/schemas";
import type { DepartmentRepository } from "../../repositories/organizational/DepartmentRepository";
import type { DivisionRepository, ManagerInfo } from "../../repositories/organizational/DivisionRepository";
import { writeAuditLog } from "../shared/audit-logger";

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
  async createDepartment(input: InsertDepartment, actorId?: string, requestId?: string): Promise<Department> {
    const department = await this.departmentRepo.createDepartment(input);
    await writeAuditLog({
      actorId,
      resourceType: "department",
      resourceId: department.id,
      action: "create",
      eventType: "department_created",
      requestId,
      details: { name: department.name, archived: department.archived }
    });
    return department;
  }

  /**
   * Update a department
   */
  async updateDepartment(id: string, data: Partial<InsertDepartment>, actorId?: string, requestId?: string): Promise<Department | undefined> {
    const dept = await this.departmentRepo.updateDepartment(id, data);
    if (dept) {
      await writeAuditLog({
        actorId,
        resourceType: "department",
        resourceId: id,
        action: "update",
        eventType: "department_updated",
        requestId,
        details: { changes: Object.keys(data) }
      });
    }
    return dept;
  }

  /**
   * Archive a department (soft delete)
   */
  async archiveDepartment(id: string, actorId?: string, requestId?: string): Promise<Department | undefined> {
    const dept = await this.departmentRepo.updateDepartment(id, { archived: true, updatedAt: new Date() });
    if (dept) {
      await writeAuditLog({
        actorId,
        resourceType: "department",
        resourceId: id,
        action: "archive",
        eventType: "department_archived",
        requestId
      });
    }
    return dept;
  }

  /**
   * Restore an archived department
   */
  async restoreDepartment(id: string, actorId?: string, requestId?: string): Promise<Department | undefined> {
    const dept = await this.departmentRepo.updateDepartment(id, { archived: false, updatedAt: new Date() });
    if (dept) {
      await writeAuditLog({
        actorId,
        resourceType: "department",
        resourceId: id,
        action: "restore",
        eventType: "department_restored",
        requestId
      });
    }
    return dept;
  }

  /**
   * Get a single department by ID (includes archived when requested)
   */
  async getDepartment(id: string, includeArchived: boolean = false): Promise<Department | undefined> {
    const departments = await this.departmentRepo.getDepartments(includeArchived);
    return departments.find((dept) => dept.id === id);
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
  async createDivision(input: InsertDivision, actorId?: string, requestId?: string): Promise<Division> {
    const division = await this.divisionRepo.createDivision(input);
    await writeAuditLog({
      actorId,
      resourceType: "division",
      resourceId: division.id,
      action: "create",
      eventType: "division_created",
      requestId,
      details: { departmentId: division.departmentId, name: division.name }
    });
    return division;
  }

  /**
   * Update a division
   */
  async updateDivision(id: string, data: Partial<InsertDivision>, actorId?: string, requestId?: string): Promise<Division | undefined> {
    const div = await this.divisionRepo.updateDivision(id, data);
    if (div) {
      await writeAuditLog({
        actorId,
        resourceType: "division",
        resourceId: id,
        action: "update",
        eventType: "division_updated",
        requestId,
        details: { changes: Object.keys(data) }
      });
    }
    return div;
  }

  /**
   * Archive a division (soft delete)
   */
  async archiveDivision(id: string, actorId?: string, requestId?: string): Promise<Division | undefined> {
    const div = await this.divisionRepo.updateDivision(id, { archived: true, updatedAt: new Date() });
    if (div) {
      await writeAuditLog({
        actorId,
        resourceType: "division",
        resourceId: id,
        action: "archive",
        eventType: "division_archived",
        requestId
      });
    }
    return div;
  }

  /**
   * Restore an archived division
   */
  async restoreDivision(id: string, actorId?: string, requestId?: string): Promise<Division | undefined> {
    const div = await this.divisionRepo.updateDivision(id, { archived: false, updatedAt: new Date() });
    if (div) {
      await writeAuditLog({
        actorId,
        resourceType: "division",
        resourceId: id,
        action: "restore",
        eventType: "division_restored",
        requestId
      });
    }
    return div;
  }

  /**
   * Get a single division by ID (includes archived when requested)
   */
  async getDivision(id: string, includeArchived: boolean = false): Promise<Division | undefined> {
    const divisions = await this.divisionRepo.getDivisions(undefined, includeArchived);
    return divisions.find((div) => div.id === id);
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
