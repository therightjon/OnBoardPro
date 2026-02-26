import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/shared/components/ui/dialog';
import { CommentList } from './comment-list';
import { CommentComposer } from './comment-composer';

export function TaskCommentsModal({ open, taskId, taskTitle, candidateId, onClose }: { open: boolean; taskId: string; taskTitle?: string; candidateId: string; onClose: () => void }) {
  const [visible, setVisible] = useState(open);
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <Dialog open={visible} onOpenChange={(o) => { setVisible(o); if (!o) onClose(); }}>
      <DialogContent className="w-[100vw] max-h-min sm:h-auto sm:w-auto sm:max-w-[600px] md:max-w-[700px] p-0 sm:p-0">
        <div className="p-4 sm:p-6">
          <DialogHeader className="pr-10">
            <DialogTitle>{taskTitle ? `Comments for ${taskTitle}` : 'Task comments'}</DialogTitle>
            <DialogDescription className="sr-only">
              View and add comments for this task.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-3" key={refreshKey}>
            <CommentList taskId={taskId} initialVisibility="all" candidateIdForTask={candidateId} />
          </div>
          <div className="mt-4 border-t pt-3">
            <CommentComposer 
              entityType="task" 
              entityId={taskId} 
              defaultVisibility="internal" 
              candidateIdForTask={candidateId}
              onSubmitted={() => setRefreshKey((k) => k + 1)}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
