import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/authorization";
import { getSystemSettingsService } from "../services/service-factory";
import { getSmtpSettings, updateSmtpSettings, sendTestEmail } from "../features/email/smtp-settings.service";
import { logAuthorizationFailure } from "../utils/authorization.utils";

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

export default router;
