import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/authorization";
import { validateBody, isZodError, handleZodError } from "../middleware/validation";
import { getOrganizationService } from "../services/service-factory";
import { insertDepartmentSchema, insertDivisionSchema } from "@shared/schemas";

const router = Router();

// Departments routes

/**
 * GET /api/departments
 * Retrieves all departments with optional archived filter
 */
router.get("/departments", requireAuth, async (req, res, next) => {
  try {
    const includeArchived = req.query.includeArchived === 'true';
    const orgService = getOrganizationService();
    const departments = await orgService.getDepartments(includeArchived);
    res.json(departments);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/departments
 * Creates a new department
 */
router.post("/departments", requireAuth, requireRole(["system_admin", "hr_staff"]), validateBody(insertDepartmentSchema), async (req, res, next) => {
  try {
    const validatedData = req.validatedBody as typeof insertDepartmentSchema._type;
    const orgService = getOrganizationService();
    const department = await orgService.createDepartment(validatedData, req.user?.id, req.id);
    res.status(201).json(department);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/departments/:id
 * Updates an existing department
 */
router.patch("/departments/:id", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    const { id } = req.params;
    const validatedData = insertDepartmentSchema.partial().parse(req.body);
    const orgService = getOrganizationService();
    const department = await orgService.updateDepartment(id, validatedData, req.user?.id, req.id);

    if (!department) {
      return res.status(404).json({ message: "Department not found" });
    }

    res.json(department);
  } catch (error) {
    if (isZodError(error)) {
      return handleZodError(res, error);
    }
    next(error);
  }
});

/**
 * DELETE /api/departments/:id
 * Soft deletes a department by marking it as archived
 */
router.delete("/departments/:id", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    const { id } = req.params;
    const orgService = getOrganizationService();
    const department = await orgService.archiveDepartment(id, req.user?.id, req.id);

    if (!department) {
      return res.status(404).json({ message: "Department not found" });
    }

    res.json({ message: "Department archived successfully", department });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/departments/:id/restore
 * Restores an archived department
 */
router.post("/departments/:id/restore", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    const { id } = req.params;
    const orgService = getOrganizationService();
    const department = await orgService.restoreDepartment(id, req.user?.id, req.id);
    if (!department) {
      return res.status(404).json({ message: "Department not found" });
    }
    res.json({ message: "Department restored successfully", department });
  } catch (error) {
    next(error);
  }
});

// Divisions routes

/**
 * GET /api/divisions
 * Retrieves divisions with optional department filter, search, and pagination
 * Supports departmentId query parameter for filtering and includeArchived for archived divisions
 */
router.get("/divisions", requireAuth, requireRole(["system_admin", "hr_staff", "department_admin", "division_leader", "manager"]), async (req, res, next) => {
  try {
    const { departmentId, q, limit = 20, offset = 0 } = req.query;
    const includeArchived = req.query.includeArchived === 'true';
    const orgService = getOrganizationService();

    // If departmentId is provided, use the specific method with search/pagination
    if (departmentId) {
      const divisions = await orgService.getDivisionsByDepartment(
        departmentId as string,
        q as string,
        parseInt(limit as string),
        parseInt(offset as string)
      );
      res.json(divisions);
    } else {
      // If no departmentId, fetch all divisions (for settings page) honoring includeArchived
      const divisions = await orgService.getDivisions(undefined, includeArchived);
      res.json(divisions);
    }
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/divisions
 * Creates a new division
 */
router.post("/divisions", requireAuth, requireRole(["system_admin", "hr_staff"]), validateBody(insertDivisionSchema), async (req, res, next) => {
  try {
    const validatedData = req.validatedBody as typeof insertDivisionSchema._type;
    const orgService = getOrganizationService();
    const division = await orgService.createDivision(validatedData, req.user?.id, req.id);
    res.status(201).json(division);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/divisions/:id
 * Updates an existing division
 */
router.patch("/divisions/:id", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    const { id } = req.params;
    const validatedData = insertDivisionSchema.partial().parse(req.body);
    const orgService = getOrganizationService();
    const division = await orgService.updateDivision(id, validatedData, req.user?.id, req.id);

    if (!division) {
      return res.status(404).json({ message: "Division not found" });
    }

    res.json(division);
  } catch (error) {
    if (isZodError(error)) {
      return handleZodError(res, error);
    }
    next(error);
  }
});

/**
 * DELETE /api/divisions/:id
 * Soft deletes a division by marking it as archived
 */
router.delete("/divisions/:id", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    const { id } = req.params;
    const orgService = getOrganizationService();
    const division = await orgService.archiveDivision(id, req.user?.id, req.id);

    if (!division) {
      return res.status(404).json({ message: "Division not found" });
    }

    res.json({ message: "Division archived successfully", division });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/divisions/:id/restore
 * Restores an archived division
 */
router.post("/divisions/:id/restore", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    const { id } = req.params;
    const orgService = getOrganizationService();
    const division = await orgService.restoreDivision(id, req.user?.id, req.id);
    if (!division) {
      return res.status(404).json({ message: "Division not found" });
    }
    res.json({ message: "Division restored successfully", division });
  } catch (error) {
    next(error);
  }
});

export default router;
