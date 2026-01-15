import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/authorization";
import { getSystemSettingsService } from "../services/service-factory";
import { getSmtpSettings, updateSmtpSettings, sendTestEmail } from "../features/email/smtp-settings.service";
import { logAuthorizationFailure } from "../utils/authorization.utils";
import { isZodError, handleZodError } from "../middleware/validation";

const router = Router();

// System settings endpoints (hr_staff, system_admin)
router.get("/system-settings", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    const systemSettingsService = getSystemSettingsService();
    const settings = await systemSettingsService.getSystemSettings();
    res.json(settings);
  } catch (error) {
    next(error);
  }
});

router.patch("/system-settings", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    const { auto_regress_on_prior_open } = req.body ?? {};
    const systemSettingsService = getSystemSettingsService();
    const updated = await systemSettingsService.setSystemSettings({ auto_regress_on_prior_open }, req.user?.id, req.id);
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// Email settings endpoints (system_admin only)
router.get("/settings/email", requireAuth, requireRole(["system_admin"]), async (_req, res, next) => {
  try {
    const settings = await getSmtpSettings();
    res.json(settings);
  } catch (error) {
    next(error);
  }
});

router.patch("/settings/email", requireAuth, requireRole(["system_admin"]), async (req: any, res) => {
  try {
    const result = await updateSmtpSettings(req.body ?? {}, req.user!.id, req.id);
    res.json(result.settings);
  } catch (error: any) {
    await logAuthorizationFailure({ req, resource: "settings", action: "settings:email:update", reason: error?.message ?? "update_failed" });
    res.status(400).json({ message: error?.message ?? "Failed to update SMTP settings" });
  }
});

router.post("/settings/email/test", requireAuth, requireRole(["system_admin"]), async (req: any, res) => {
  const email = req.user?.email;
  if (!email) {
    return res.status(400).json({ ok: false, message: "Current user email is not set" });
  }
  const name = `${req.user?.firstName ?? ""} ${req.user?.lastName ?? ""}`.trim() || email;
  const result = await sendTestEmail(email, name);
  if (result.ok) {
    return res.json({ ok: true });
  }
  return res.status(502).json(result);
});

// Security settings validation schema
const securitySettingsSchema = z.object({
  session_idle_timeout_hours: z.coerce.number().min(0.1).max(24).optional(),
  session_absolute_timeout_hours: z.coerce.number().min(1).max(168).optional(),
});

// Security settings endpoints (system_admin only)
router.get("/settings/security", requireAuth, requireRole(["system_admin"]), async (_req, res, next) => {
  try {
    const systemSettingsService = getSystemSettingsService();
    const settings = await systemSettingsService.getSecuritySettings();
    res.json(settings);
  } catch (error) {
    next(error);
  }
});

router.patch("/settings/security", requireAuth, requireRole(["system_admin"]), async (req: any, res, next) => {
  try {
    const validated = securitySettingsSchema.parse(req.body ?? {});
    const systemSettingsService = getSystemSettingsService();
    const updated = await systemSettingsService.setSecuritySettings(validated, req.user?.id, req.id);
    res.json(updated);
  } catch (error) {
    if (isZodError(error)) {
      return handleZodError(res, error);
    }
    next(error);
  }
});

export default router;
