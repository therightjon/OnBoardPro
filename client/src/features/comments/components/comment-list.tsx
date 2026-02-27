import { useMemo, useState, useCallback } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import { useCandidateComments, useTaskComments } from '../api';
import type { CommentDto } from '../types';
import { CommentItem } from './comment-item';
import { CommentComposer } from './comment-composer';

type Props = { candidateId?: string; taskId?: string; initialVisibility: 'all'|'internal'|'external'; candidateIdForTask?: string };

export function CommentList({ candidateId, taskId, initialVisibility, candidateIdForTask }: Props) {
  const [visibility, setVisibility] = useState<'all'|'internal'|'external'>(initialVisibility);
  const query = candidateId ? useCandidateComments(candidateId, visibility) : taskId ? useTaskComments(taskId, visibility) : undefined;
  const items = useMemo(() => (query?.data?.pages || []).flatMap((p: any) => p.items as CommentDto[]), [query?.data]);
  const [replyTo, setReplyTo] = useState<{ parentId: string; lockedVisibility: 'internal'|'external' } | null>(null);

  const grouped = useMemo(() => {
    // Hide deleted comments from the list
    const visibleItems = items.filter((c) => !c.isDeleted);
    const parents = visibleItems.filter(c => !c.parentId);
    const replies = visibleItems.filter(c => !!c.parentId);
    const byParent: Record<string, CommentDto[]> = {};
    for (const r of replies) {
      if (!r.parentId) continue;
      byParent[r.parentId] = byParent[r.parentId] || [];
      byParent[r.parentId].push(r);
    }
    return { parents, byParent, visibleCount: visibleItems.length };
  }, [items]);

  const onReply = useCallback((parentId: string, lockedVisibility: 'internal'|'external') => 
    setReplyTo({ parentId, lockedVisibility }), []);

  const onDeleted = useCallback((id: string) => {
    if (replyTo?.parentId === id) setReplyTo(null);
  }, [replyTo?.parentId]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button size="sm" variant={visibility==='all' ? 'default' : 'outline'} onClick={() => setVisibility('all')} aria-label="Show all comments">All</Button>
        <Button size="sm" variant={visibility==='internal' ? 'default' : 'outline'} onClick={() => setVisibility('internal')} aria-label="Show internal comments">Internal</Button>
        <Button size="sm" variant={visibility==='external' ? 'default' : 'outline'} onClick={() => setVisibility('external')} aria-label="Show external comments">External</Button>
        {(() => {
          const serverTotal = query?.data?.pages?.[0]?.totalVisibleCount ?? 0;
          const loadedVisible = grouped.visibleCount;
          const showTotal = query?.hasNextPage ? serverTotal : loadedVisible;
          return <div className="ml-auto text-xs text-muted-foreground">{showTotal} total</div>;
        })()}
      </div>

      <div className="space-y-3">
        {grouped.parents.map((p) => (
          <div key={p.id}>
            <CommentItem 
              comment={p}
              candidateId={(candidateId || candidateIdForTask || '')}
              taskId={taskId}
              onReply={onReply}
              onDeleted={onDeleted}
            />
            {(grouped.byParent[p.id] || []).map((child) => (
              <div key={child.id} className="mt-2 ml-4 pl-3 border-l">
                <CommentItem comment={child} candidateId={(candidateId || candidateIdForTask || '')} taskId={taskId} />
              </div>
            ))}
            {replyTo?.parentId === p.id && (
              <div className="mt-2 ml-4 pl-3 border-l">
                <Badge variant="outline" className="mb-1">Replying</Badge>
                {candidateId ? (
                  <CommentComposer 
                    entityType="candidate" 
                    entityId={candidateId} 
                    defaultVisibility={replyTo.lockedVisibility} 
                    lockedVisibility={replyTo.lockedVisibility}
                    parentId={replyTo.parentId}
                    onSubmitted={() => { setReplyTo(null); query?.refetch(); }}
                    onCancel={() => setReplyTo(null)}
                  />
                ) : (
                  <CommentComposer 
                    entityType="task" 
                    entityId={taskId!} 
                    defaultVisibility={replyTo.lockedVisibility}
                    lockedVisibility={replyTo.lockedVisibility}
                    parentId={replyTo.parentId}
                    candidateIdForTask={candidateIdForTask}
                    onSubmitted={() => { setReplyTo(null); query?.refetch(); }}
                    onCancel={() => setReplyTo(null)}
                  />
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {query?.hasNextPage && (
        <Button size="sm" variant="outline" onClick={() => query.fetchNextPage()} aria-label="Load more comments">Load More</Button>
      )}

      {/* No global reply composer; reply is shown inline beneath the selected parent. */}
    </div>
  );
}
