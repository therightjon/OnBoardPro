import { useState } from 'react';
import { Textarea } from '@/shared/components/ui/textarea';
import { Button } from '@/shared/components/ui/button';
import { 
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction
} from '@/shared/components/ui/alert-dialog';
import { Label } from '@/shared/components/ui/label';
import { Switch } from '@/shared/components/ui/switch';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { useCreateCandidateComment, useCreateTaskComment } from '../api';
import { useToast } from '@/shared/hooks/use-toast';

type Props = {
  entityType: 'candidate' | 'task';
  entityId: string;
  defaultVisibility: 'internal' | 'external';
  lockedVisibility?: 'internal' | 'external';
  parentId?: string;
  candidateIdForTask?: string; // needed for stats invalidation when entityType==='task'
  onSubmitted?: () => void;
};

export function CommentComposer({ entityType, entityId, defaultVisibility, lockedVisibility, parentId, candidateIdForTask, onSubmitted }: Props) {
  const { user } = useAuth();
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<'internal'|'external'>(lockedVisibility || defaultVisibility);
  const [showConfirm, setShowConfirm] = useState(false);
  const { toast } = useToast();

  const createCandidate = useCreateCandidateComment(entityId);
  const createTask = entityType === 'task' && candidateIdForTask ? useCreateTaskComment(entityId, candidateIdForTask) : undefined;

  const canToggleVisibility = !lockedVisibility && user && user.role !== 'candidate';

  const [submitting, setSubmitting] = useState(false);
  const handleSubmit = async () => {
    const payload = { body: body.trim(), visibility, parentId } as any;
    if (!payload.body || submitting) return;
    setSubmitting(true);
    try {
      if (entityType === 'candidate') await createCandidate.mutateAsync(payload);
      else if (entityType === 'task' && createTask) await createTask.mutateAsync(payload);
      setBody('');
      toast({ title: 'Comment posted' });
      onSubmitted?.();
    } catch (e: any) {
      toast({ title: 'Failed to post comment', description: e?.message || 'Please try again', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = (val: boolean) => {
    const next = val ? 'external' : 'internal';
    // Always confirm when changing from internal -> external, regardless of body content
    if (visibility === 'internal' && next === 'external') {
      setShowConfirm(true);
    } else {
      setVisibility(next);
    }
  };

  return (
    <div className="space-y-2">
      {canToggleVisibility && (
        <div className="flex items-center gap-2">
          <Label htmlFor="visibility-toggle" className="text-xs">Internal</Label>
          <Switch id="visibility-toggle" checked={visibility === 'external'} onCheckedChange={handleToggle} aria-label="Toggle visibility to external" />
          <Label htmlFor="visibility-toggle" className="text-xs">External</Label>
        </div>
      )}
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a comment..."
        className="min-h-[80px]"
        aria-label="Comment text"
      />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{body.length} chars</span>
        <Button size="sm" className="min-h-[36px]" onClick={handleSubmit} aria-label="Submit comment" disabled={submitting || body.trim().length === 0}>
          {submitting ? 'Submitting…' : 'Submit'}
        </Button>
      </div>
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Make this comment external?</AlertDialogTitle>
            <AlertDialogDescription>
              Confirm changing comment visibility from internal to external.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel aria-label="Cancel visibility change">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setVisibility('external'); setShowConfirm(false); }} aria-label="Confirm visibility change">Confirm</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
