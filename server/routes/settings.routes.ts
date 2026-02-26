import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/authorization";
import { getSystemSettingsService, getEmailTemplateService } from "../services/service-factory";
import { getSmtpSettings, updateSmtpSettings, sendTestEmail } from "../features/email/smtp-settings.service";
import { logAuthorizationFailure } from "../utils/authorization.utils";
import { isZodError, handleZodError } from "../middleware/validation";
import {
  EMAIL_TEMPLATE_TYPES,
  type EmailTemplateType,
  updateEmailTemplateSchema,
  previewEmailTemplateSchema,
} from "@shared/schemas";

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

// ============================================================================
// Email Template endpoints (system_admin for writes, system_admin + hr_staff for reads)
// ============================================================================

function isValidTemplateType(type: string): type is EmailTemplateType {
  return (EMAIL_TEMPLATE_TYPES as readonly string[]).includes(type);
}

router.get("/settings/email-templates", requireAuth, requireRole(["system_admin", "hr_staff"]), async (_req, res, next) => {
  try {
    const service = getEmailTemplateService();
    const templates = await service.getAllTemplates();
    res.json(templates);
  } catch (error) {
    next(error);
  }
});

router.get("/settings/email-templates/:type", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    const { type } = req.params;
    if (!isValidTemplateType(type)) {
      return res.status(400).json({ message: `Invalid template type: ${type}` });
    }
    const service = getEmailTemplateService();
    const template = await service.getTemplate(type);
    if (!template) {
      return res.status(404).json({ message: "Template not found" });
    }
    res.json(template);
  } catch (error) {
    next(error);
  }
});

router.put("/settings/email-templates/:type", requireAuth, requireRole(["system_admin"]), async (req: any, res, next) => {
  try {
    const { type } = req.params;
    if (!isValidTemplateType(type)) {
      return res.status(400).json({ message: `Invalid template type: ${type}` });
    }
    const validated = updateEmailTemplateSchema.parse(req.body);
    const service = getEmailTemplateService();
    const updated = await service.updateTemplate(type, validated, req.user!.id);
    res.json(updated);
  } catch (error) {
    if (isZodError(error)) {
      return handleZodError(res, error);
    }
    if (error instanceof Error && error.message.includes("Unknown template variables")) {
      return res.status(400).json({ message: error.message });
    }
    next(error);
  }
});

router.post("/settings/email-templates/:type/reset", requireAuth, requireRole(["system_admin"]), async (req: any, res, next) => {
  try {
    const { type } = req.params;
    if (!isValidTemplateType(type)) {
      return res.status(400).json({ message: `Invalid template type: ${type}` });
    }
    const service = getEmailTemplateService();
    const template = await service.resetTemplate(type, req.user!.id);
    res.json(template);
  } catch (error) {
    next(error);
  }
});

router.post("/settings/email-templates/:type/preview", requireAuth, requireRole(["system_admin", "hr_staff"]), async (req, res, next) => {
  try {
    const { type } = req.params;
    if (!isValidTemplateType(type)) {
      return res.status(400).json({ message: `Invalid template type: ${type}` });
    }
    const validated = previewEmailTemplateSchema.parse(req.body);
    const service = getEmailTemplateService();

    // If subject/body provided, use those; otherwise load from DB
    let subjectTemplate = validated.subjectTemplate;
    let bodyTemplate = validated.bodyTemplate;
    if (!subjectTemplate || !bodyTemplate) {
      const dbTemplate = await service.getTemplate(type);
      if (dbTemplate) {
        subjectTemplate = subjectTemplate ?? dbTemplate.subjectTemplate;
        bodyTemplate = bodyTemplate ?? dbTemplate.bodyTemplate;
      }
    }

    const preview = service.renderPreview(type, subjectTemplate, bodyTemplate);
    res.json(preview);
  } catch (error) {
    if (isZodError(error)) {
      return handleZodError(res, error);
    }
    next(error);
  }
});

router.post("/settings/email-templates/:type/test", requireAuth, requireRole(["system_admin"]), async (req: any, res, next) => {
  try {
    const { type } = req.params;
    if (!isValidTemplateType(type)) {
      return res.status(400).json({ message: `Invalid template type: ${type}` });
    }
    const email = req.user?.email;
    if (!email) {
      return res.status(400).json({ ok: false, message: "Current user email is not set" });
    }
    const service = getEmailTemplateService();
    const preview = service.renderPreview(type);
    const { sendTestEmail } = await import("../features/email/smtp-settings.service");
    const name = `${req.user?.firstName ?? ""} ${req.user?.lastName ?? ""}`.trim() || email;
    // Use a custom test-send that uses the template content
    const result = await sendTestEmail(email, name, preview.subject, preview.html);
    if (result.ok) {
      return res.json({ ok: true });
    }
    return res.status(502).json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
