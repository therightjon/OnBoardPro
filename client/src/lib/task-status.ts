export const TASK_STATUS = ['todo', 'in_progress', 'blocked', 'done', 'canceled'] as const;

export const TASK_STATUS_LABEL: Record<string, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  blocked: 'Blocked',
  done: 'Done',
  canceled: 'Canceled',
};

export type TaskStatus = typeof TASK_STATUS[number];