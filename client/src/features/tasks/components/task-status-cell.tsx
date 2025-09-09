import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TASK_STATUS, TASK_STATUS_LABEL } from '@/lib/task-status';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { apiRequest } from '@/lib/queryClient';
import { invalidateCandidate } from '@/lib/query-invalidate';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { useState } from 'react';

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
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [ack, setAck] = useState(false);

  type MutVars = { status: string; reason?: string };
  const mutation = useMutation({
    mutationFn: async (vars: MutVars) => {
      const payload: any = { status: vars.status };
      if (vars.status === 'canceled') {
        payload.cancel_reason = (vars.reason ?? '').trim();
      }
      const res = await apiRequest('PATCH', `/api/tasks/${taskId}`, payload);
      return res.json();
    },
    onMutate: async (vars: MutVars) => {
      const nextStatus = vars.status;
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
    onError: (err: any, _vars, ctx) => {
      // If server reports prior-stage block, treat as soft success: keep optimistic state and refresh
      if (err?.code === 'BLOCKED_BY_PRIOR_STAGE') {
        toast.message('Task updated. Candidate remains blocked by prior-stage tasks.');
      qc.invalidateQueries({ queryKey: ['/api/candidates', candidateId, 'tasks'] });
      qc.invalidateQueries({ queryKey: ['/api/candidates', candidateId] });
      qc.invalidateQueries({ queryKey: ['/api/candidates', candidateId, 'stage-history'] });
      qc.invalidateQueries({ queryKey: ['/api/candidates', candidateId, 'estimate', { businessDays: true }] });
      return;
    }
      // Otherwise revert optimistic update and show error
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
      qc.invalidateQueries({ queryKey: ['/api/candidates', candidateId, 'estimate', { businessDays: true }] });
      qc.invalidateQueries({ queryKey: ['/api/candidates'] });
      
      // Show appropriate success messages
      if (data.advancement?.advanced) {
        toast.success(`Status updated and advanced to ${data.advancement.toStageName}`);
      } else if (data?.recompute?.isBlocked) {
        toast.message('Status updated. Candidate remains blocked by prior-stage tasks.');
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
    <>
    <Select
      value={value}
      onValueChange={(v) => {
        if (v === 'canceled') {
          setCancelOpen(true);
        } else {
          mutation.mutate({ status: v });
        }
      }}
      disabled={disabled || mutation.isPending || value === 'canceled'}
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

    <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
      <DialogContent className='max-h-min'>
        <DialogHeader>
          <DialogTitle>Cancel Task</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            This task will be excluded from blockers and may move the candidate forward.
          </p>
          <div>
            <label className="text-sm font-medium">Reason</label>
            <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Short reason" />
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id={`ack-${taskId}`} checked={ack} onCheckedChange={(v:any)=> setAck(!!v)} />
            <label htmlFor={`ack-${taskId}`} className="text-sm">I understand this cannot be undone.</label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={()=>{ setCancelOpen(false); setCancelReason(''); setAck(false); }}>Close</Button>
            <Button disabled={!cancelReason.trim() || !ack || mutation.isPending} onClick={()=>{
              setCancelOpen(false);
              mutation.mutate({ status: 'canceled', reason: cancelReason });
              setCancelReason('');
              setAck(false);
            }}>Confirm Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
