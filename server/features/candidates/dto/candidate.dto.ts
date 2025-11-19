import { z } from 'zod';
import { insertCandidateSchema } from '@shared/schemas';

/**
 * DTO for creating a new candidate
 */
export const createCandidateDTO = insertCandidateSchema.extend({
  templateId: z.string().uuid().optional(),
  applyTemplate: z.boolean().optional().default(false)
});

export type CreateCandidateDTO = z.infer<typeof createCandidateDTO>;

/**
 * DTO for updating an existing candidate
 */
export const updateCandidateDTO = insertCandidateSchema.partial().extend({
  id: z.string().uuid()
});

export type UpdateCandidateDTO = z.infer<typeof updateCandidateDTO>;

/**
 * DTO for candidate search/filter parameters
 */
export const candidateFilterDTO = z.object({
  search: z.string().optional(),
  status: z.enum(['draft', 'active', 'on_hold', 'completed', 'canceled', 'archived']).optional(),
  departmentId: z.string().uuid().optional(),
  divisionId: z.string().uuid().optional(),
  managerId: z.string().uuid().optional(),
  candidateTypeId: z.string().uuid().optional(),
  stageId: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(100).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0)
});

export type CandidateFilterDTO = z.infer<typeof candidateFilterDTO>;

/**
 * DTO for applying a template to a candidate
 */
export const applyTemplateDTO = z.object({
  templateId: z.string().uuid(),
  candidateId: z.string().uuid()
});

export type ApplyTemplateDTO = z.infer<typeof applyTemplateDTO>;
