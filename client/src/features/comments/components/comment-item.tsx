import { useState } from 'react';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { useEditComment, useDeleteComment } from '../api';
import type { CommentDto } from '../types';

export function CommentItem({ comment, candidateId, taskId, onReply, onDeleted }: { comment: CommentDto; candidateId: string; taskId?: string; onReply?: (parentId: string, lockedVisibility: 'internal'|'external') => void; onDeleted?: (id: string) => void }) {
  const { user } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const edit = useEditComment({ candidateId, taskId });
  const del = useDeleteComment({ candidateId, taskId });

  const canAdmin = user && (user.role === 'system_admin' || user.role === 'hr_staff');
  const isAuthor = user && user.id === comment.author?.id;
  const createdMs = new Date(comment.createdAt).getTime();
  const canWindow = Date.now() - createdMs <= 5 * 60 * 1000;
  const canEdit = canAdmin || (isAuthor && canWindow);
  const canDelete = canAdmin || (isAuthor && canWindow);

  const onSave = async () => {
    await edit.mutateAsync({ id: comment.id, body: draft });
    setIsEditing(false);
  };

  const onDelete = async () => {
    await del.mutateAsync({ id: comment.id });
    onDeleted?.(comment.id);
  };

  return (
    <div className="p-3 rounded border">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{comment.author?.firstName} {comment.author?.lastName}</span>
        <span>• {new Date(comment.createdAt).toLocaleString()}</span>
        <Badge variant="outline" className={comment.visibility === 'internal' ? 'bg-muted' : 'bg-blue-50 text-blue-700 border-blue-200'}>
          {comment.visibility === 'internal' ? 'Internal' : 'External'}
        </Badge>
      </div>
      {isEditing ? (
        <div className="mt-2 flex items-center gap-2">
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Edit comment text" />
          <Button size="sm" onClick={onSave} aria-label="Save comment edits">Save</Button>
          <Button size="sm" variant="outline" onClick={() => { setIsEditing(false); setDraft(comment.body); }} aria-label="Cancel comment edits">Cancel</Button>
        </div>
      ) : (
        <div className="mt-2 text-sm whitespace-pre-wrap break-words">{comment.isDeleted ? '[deleted]' : comment.body}</div>
      )}
      <div className="mt-2 flex items-center gap-2">
        {onReply && !comment.isDeleted && (
          <Button size="sm" variant="ghost" onClick={() => onReply(comment.id, comment.visibility)} aria-label={`Reply to comment by ${comment.author?.firstName}`}>Reply</Button>
        )}
        {canEdit && !comment.isDeleted && (
          <Button size="sm" variant="ghost" onClick={() => setIsEditing(true)} aria-label="Edit comment">Edit</Button>
        )}
        {canDelete && !comment.isDeleted && (
          <Button size="sm" variant="ghost" onClick={onDelete} aria-label="Delete comment">Delete</Button>
        )}
      </div>
    </div>
  );
}
