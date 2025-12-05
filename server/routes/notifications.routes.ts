import { Router } from "express";
import { getNotificationService, getCommentService } from "../services/service-factory";
import { requireAuth } from "../middleware/authorization";

const router = Router();

// Notification routes
router.get("/notifications", requireAuth, async (req, res, next) => {
  try {
    const limitParam = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : undefined;
    const limit = limitParam && !Number.isNaN(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 20;
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const unreadOnly = req.query.unreadOnly === 'true' || req.query.unreadOnly === '1';
    const typeParam = req.query.type;

    let types: string[] | undefined;
    if (typeof typeParam === 'string') {
      types = typeParam.split(',').map((t) => t.trim()).filter(Boolean);
    } else if (Array.isArray(typeParam)) {
      types = typeParam.filter((t): t is string => typeof t === 'string').map((t) => t.trim()).filter(Boolean);
    }

    const notificationService = getNotificationService();
    const result = await notificationService.getNotifications({
      userId: req.user!.id,
      limit,
      cursor,
      unreadOnly,
      types,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.patch("/notifications/:id", requireAuth, async (req, res, next) => {
  try {
    const { isRead } = req.body ?? {};
    if (typeof isRead !== 'boolean') {
      return res.status(400).json({ message: 'isRead flag must be provided as boolean' });
    }

    const notificationService = getNotificationService();
    const updated = isRead 
      ? await notificationService.markAsRead(req.params.id, req.user!.id)
      : await notificationService.markAsUnread(req.params.id, req.user!.id);
    if (!updated) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post("/notifications/mark-all-read", requireAuth, async (req, res, next) => {
  try {
    const notificationService = getNotificationService();
    await notificationService.markAllAsRead(req.user!.id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Comment routes
router.patch("/comments/:id", requireAuth, async (req: any, res, next) => {
  try {
    const { body } = req.body || {};
    if (!body) return res.status(400).json({ message: 'body is required' });
    const commentService = getCommentService();
    const updated = await commentService.editComment({ id: req.params.id, userId: req.user.id, userRole: req.user.role, body });
    res.json(updated);
  } catch (error: any) { res.status(400).json({ message: error.message || 'Unable to edit comment' }); }
});

router.delete("/comments/:id", requireAuth, async (req: any, res, next) => {
  try {
    const commentService = getCommentService();
    await commentService.deleteComment({ id: req.params.id, userId: req.user.id, userRole: req.user.role });
    res.sendStatus(204);
  } catch (error: any) { res.status(400).json({ message: error.message || 'Unable to delete comment' }); }
});

export default router;
