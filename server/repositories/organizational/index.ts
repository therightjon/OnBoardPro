/**
 * Organizational Repositories
 *
 * Exports repositories for managing organizational structure:
 * - DepartmentRepository: Manages departments (top-level organizational units)
 * - DivisionRepository: Manages divisions (sub-units within departments)
 *
 * These repositories handle CRUD operations for organizational hierarchy
 * and related queries such as finding managers within departments/divisions.
 */

export { DepartmentRepository } from "./DepartmentRepository";
export { DivisionRepository, type ManagerInfo } from "./DivisionRepository";
