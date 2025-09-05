import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TASK_STATUS, TASK_STATUS_LABEL } from '@/lib/task-status';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/queryClient';
import { invalidateCandidate } from '@/lib/query-invalidate';

export function TaskStatusCell({
  taskId,
  candidateId,
  value,
  disabled,
}: {
  taskId: string;
  candidateId: string;
  value: string;   // current status
  disabled?: boolean;
}) {
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (nextStatus: string) => {
      const res = await apiRequest('PATCH', `/api/tasks/${taskId}`, { status: nextStatus });
      return res.json();
    },
    onMutate: async (nextStatus) => {
      // optimistic update: snapshot
      const taskKey = ['/api/candidates', candidateId, 'tasks'];
      await qc.cancelQueries({ queryKey: taskKey });
      const previous = qc.getQueryData<any>(taskKey);
      
      qc.setQueryData<any>(taskKey, (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((t: any) =>
          t.id === taskId ? { 
            ...t, 
            status: nextStatus, 
            completedAt: nextStatus === 'done' ? t.completedAt ?? new Date().toISOString() : null 
          } : t
        );
      });
      
      return { previous, taskKey };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(ctx.taskKey, ctx.previous);
      toast.error((err as Error).message);
    },
    onSuccess: (data) => {
      // Handle new server response format: { task, candidate, advancement }
      
      // Update task data immediately with authoritative response
      qc.setQueryData(['/api/candidates', candidateId, 'tasks'], (old: any[] = []) =>
        old.map(t => t.id === data.task.id ? { ...t, ...data.task } : t)
      );
      
      // If candidate stage advanced, update candidate data immediately
      if (data.candidate && data.advancement?.advanced) {
        qc.setQueryData(['/api/candidates', candidateId], (old: any) =>
          old ? { 
            ...old, 
            currentStageId: data.candidate.current_stage_id,
            updatedAt: data.candidate.updated_at 
          } : old
        );
      }
      
      // Invalidate all related queries to refresh stage and task data
      qc.invalidateQueries({ queryKey: ['/api/candidates', candidateId, 'tasks'] });
      qc.invalidateQueries({ queryKey: ['/api/candidates', candidateId] });
      qc.invalidateQueries({ queryKey: ['/api/candidates', candidateId, 'stage-history'] });
      qc.invalidateQueries({ queryKey: ['/api/candidates'] });
      
      // Show appropriate success messages
      if (data.advancement?.advanced) {
        toast.success(`Status updated and advanced to ${data.advancement.toStageName}`);
      } else {
        toast.success('Status updated');
      }
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'todo': return 'text-muted-foreground';
      case 'in_progress': return 'text-blue-600 dark:text-blue-400';
      case 'blocked': return 'text-red-600 dark:text-red-400';
      case 'done': return 'text-green-600 dark:text-green-400';
      case 'canceled': return 'text-gray-500 dark:text-gray-400';
      default: return 'text-muted-foreground';
    }
  };

  return (
    <Select
      value={value}
      onValueChange={(v) => mutation.mutate(v)}
      disabled={disabled || mutation.isPending}
    >
      <SelectTrigger 
        className={cn('w-[140px]', mutation.isPending && 'opacity-70', getStatusColor(value))}
        aria-label="Task status"
        data-testid={`select-task-status-${taskId}`}
      >
        <SelectValue placeholder="Set status" />
      </SelectTrigger>
      <SelectContent>
        {TASK_STATUS.map((s) => (
          <SelectItem key={s} value={s} data-testid={`option-status-${s}`}>
            {TASK_STATUS_LABEL[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}