import { z } from 'zod';
import { insertCandidateTaskSchema } from '@shared/schemas';

/**
 * DTO for creating a new task
 */
export const createTaskDTO = insertCandidateTaskSchema.extend({
  candidateId: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  stageId: z.string().uuid(),
  assigneeUserId: z.string().uuid().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  categoryId: z.string().uuid(),
  dueAt: z.coerce.date().optional(),
  required: z.boolean().optional().default(true)
});

export type CreateTaskDTO = z.infer<typeof createTaskDTO>;

/**
 * DTO for updating an existing task
 */
export const updateTaskDTO = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  status: z.enum(['todo', 'in_progress', 'blocked', 'done', 'canceled']).optional(),
  assigneeUserId: z.string().uuid().optional().nullable(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  dueAt: z.coerce.date().optional().nullable(),
  notes: z.string().optional(),
  required: z.boolean().optional()
});

export type UpdateTaskDTO = z.infer<typeof updateTaskDTO>;

/**
 * DTO for task filter parameters
 */
export const taskFilterDTO = z.object({
  candidateId: z.string().uuid().optional(),
  assigneeUserId: z.string().uuid().optional(),
  status: z.enum(['todo', 'in_progress', 'blocked', 'done', 'canceled']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  stageId: z.string().uuid().optional(),
  search: z.string().optional(),
  showArchived: z.boolean().optional().default(false),
  limit: z.coerce.number().min(1).max(100).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0)
});

export type TaskFilterDTO = z.infer<typeof taskFilterDTO>;
