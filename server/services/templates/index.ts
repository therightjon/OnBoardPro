/**
 * Template Services
 *
 * Central export point for all template-related service classes.
 */

export { TemplateExpansionService } from "./template-expansion.service";
export { TemplateEstimationService } from "./template-estimation.service";
export type {
  EstimateTemplateOptions,
  NonEstimableTask,
  PhaseSummary,
  StageSummary,
  TemplateEstimationResult,
  CandidateEstimationResult,
} from "./template-estimation.service";
