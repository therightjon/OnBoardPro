import { QueryClient } from '@tanstack/react-query';

/**
 * Centralized query invalidation helpers to ensure consistent cache updates
 * across all candidate and template mutations
 */

export function invalidateCandidate(qc: QueryClient, id: string) {
  qc.invalidateQueries({ queryKey: ['/api/candidates', id] });
  qc.invalidateQueries({ queryKey: ['/api/candidates', id, 'tasks'] });
  qc.invalidateQueries({ queryKey: ['/api/candidates', id, 'stages'] });
  qc.invalidateQueries({ queryKey: ['/api/candidates', id, 'stage-history'] });
  qc.invalidateQueries({ queryKey: ['/api/candidates'] }); // list summary row (stage badge)
}

export function invalidateTemplate(qc: QueryClient, id: string) {
  qc.invalidateQueries({ queryKey: ['/api/templates', id] });
  qc.invalidateQueries({ queryKey: ['/api/templates', id, 'template-stages'] });
  qc.invalidateQueries({ queryKey: ['/api/templates', id, 'template-tasks'] });
  qc.invalidateQueries({ queryKey: ['/api/templates'] });
}

export function invalidateGlobalData(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['/api/hiring-stages'] });
  qc.invalidateQueries({ queryKey: ['/api/departments'] });
  qc.invalidateQueries({ queryKey: ['/api/divisions'] });
  qc.invalidateQueries({ queryKey: ['/api/candidate-types'] });
  qc.invalidateQueries({ queryKey: ['/api/faculty-ranks'] });
  qc.invalidateQueries({ queryKey: ['/api/task-definitions'] });
  qc.invalidateQueries({ queryKey: ['/api/task-priorities'] });
  qc.invalidateQueries({ queryKey: ['/api/task-categories'] });
  qc.invalidateQueries({ queryKey: ['/api/users'] });
}

export function invalidateMyTasks(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['/api/tasks/mine'] });
  qc.invalidateQueries({ queryKey: ['/api/tasks'] });
}