/**
 * Candidates Feature - Component Exports
 */

// Components
export { EditableStatusBadge } from './components/editable-status-badge';
export { CandidatePipelineEstimate } from './components/candidate-pipeline-estimate';
export { HiringProgress } from './components/hiring-progress';

// Utils
export { 
  candidateStatusBadgeClass, 
  isCandidateFullyOnboarded, 
  resolveCandidateStatus, 
  summarizeCandidateTasks, 
  canArchiveCandidate,
  type ResolvedCandidateStatus 
} from './utils/status';
