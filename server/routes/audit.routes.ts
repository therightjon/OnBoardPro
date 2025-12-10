import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/authorization";
import { getAuditService } from "../services/service-factory";

const router = Router();

// GET /api/admin/audit - privileged audit log query
router.get("/admin/audit", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    const { resourceType, action, actorId, before } = req.query;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
    const auditService = getAuditService();
    const result = await auditService.list({
      resourceType: resourceType as string | undefined,
      action: action as string | undefined,
      actorId: actorId as string | undefined,
      before: before as string | undefined,
      limit: Number.isFinite(limit) ? limit : 50
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
