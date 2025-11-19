import { Router } from "express";
import { storage } from "../db/storage";
import { requireAuth } from "../middleware/authorization";
import {
  listNotificationsHandler,
  markNotificationReadHandler,
  markAllNotificationsReadHandler
} from "../features/notifications/routes";

const router = Router();

// Notification routes
router.get("/notifications", requireAuth, (req, res, next) => listNotificationsHandler(storage, req, res, next));

router.patch("/notifications/:id", requireAuth, (req, res, next) => markNotificationReadHandler(storage, req, res, next));

router.post("/notifications/mark-all-read", requireAuth, (req, res, next) => markAllNotificationsReadHandler(storage, req, res, next));

// Comment routes
router.patch("/comments/:id", requireAuth, async (req: any, res, next) => {
  try {
    const { body } = req.body || {};
    if (!body) return res.status(400).json({ message: 'body is required' });
    const updated = await storage.editComment({ id: req.params.id, userId: req.user.id, userRole: req.user.role, body });
    res.json(updated);
  } catch (error: any) { res.status(400).json({ message: error.message || 'Unable to edit comment' }); }
});

router.delete("/comments/:id", requireAuth, async (req: any, res, next) => {
  try {
    await storage.deleteComment({ id: req.params.id, userId: req.user.id, userRole: req.user.role });
    res.sendStatus(204);
  } catch (error: any) { res.status(400).json({ message: error.message || 'Unable to delete comment' }); }
});

export default router;
