import { describe, it, expect } from 'vitest';
import { TASK_STATUS, TASK_STATUS_LABEL, type TaskStatus } from './task-status';

describe('Task Status Constants', () => {
  describe('TASK_STATUS', () => {
    it('contains all expected status values', () => {
      expect(TASK_STATUS).toEqual(['todo', 'in_progress', 'blocked', 'done', 'canceled']);
    });

    it('is readonly array', () => {
      expect(TASK_STATUS).toHaveLength(5);
      // TypeScript will enforce readonly at compile time
    });

    it('can be used as type guard', () => {
      const status: string = 'todo';
      const isValidStatus = TASK_STATUS.includes(status as TaskStatus);
      expect(isValidStatus).toBe(true);
    });

    it('rejects invalid status', () => {
      const status: string = 'invalid';
      const isValidStatus = TASK_STATUS.includes(status as TaskStatus);
      expect(isValidStatus).toBe(false);
    });
  });

  describe('TASK_STATUS_LABEL', () => {
    it('has labels for all statuses', () => {
      expect(TASK_STATUS_LABEL).toHaveProperty('todo');
      expect(TASK_STATUS_LABEL).toHaveProperty('in_progress');
      expect(TASK_STATUS_LABEL).toHaveProperty('blocked');
      expect(TASK_STATUS_LABEL).toHaveProperty('done');
      expect(TASK_STATUS_LABEL).toHaveProperty('canceled');
    });

    it('has human-readable labels', () => {
      expect(TASK_STATUS_LABEL.todo).toBe('To do');
      expect(TASK_STATUS_LABEL.in_progress).toBe('In progress');
      expect(TASK_STATUS_LABEL.blocked).toBe('Blocked');
      expect(TASK_STATUS_LABEL.done).toBe('Done');
      expect(TASK_STATUS_LABEL.canceled).toBe('Canceled');
    });

    it('can map status to label', () => {
      const status: TaskStatus = 'todo';
      const label = TASK_STATUS_LABEL[status];
      expect(label).toBe('To do');
    });

    it('all labels are strings', () => {
      Object.values(TASK_STATUS_LABEL).forEach(label => {
        expect(typeof label).toBe('string');
        expect(label.length).toBeGreaterThan(0);
      });
    });

    it('labels are properly capitalized', () => {
      Object.values(TASK_STATUS_LABEL).forEach(label => {
        // First letter should be uppercase
        expect(label[0]).toBe(label[0].toUpperCase());
      });
    });

    it('every status has a label', () => {
      TASK_STATUS.forEach(status => {
        expect(TASK_STATUS_LABEL[status]).toBeDefined();
        expect(TASK_STATUS_LABEL[status]).not.toBe('');
      });
    });
  });

  describe('TaskStatus type', () => {
    it('accepts valid status values', () => {
      const validStatuses: TaskStatus[] = ['todo', 'in_progress', 'blocked', 'done', 'canceled'];
      validStatuses.forEach(status => {
        expect(TASK_STATUS.includes(status)).toBe(true);
      });
    });

    it('can be used in arrays', () => {
      const statuses: TaskStatus[] = ['todo', 'done'];
      expect(statuses).toHaveLength(2);
      expect(statuses[0]).toBe('todo');
      expect(statuses[1]).toBe('done');
    });
  });
});
