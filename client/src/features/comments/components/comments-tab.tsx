import { useAuth } from '@/features/auth/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { CommentList } from './comment-list';
import { CommentComposer } from './comment-composer';

export function CommentsTab({ candidateId }: { candidateId: string }) {
  const { user } = useAuth();
  const defaultVis = user?.role === 'candidate' ? 'external' : 'internal';
  return (
    <Card>
      <CardHeader>
        <CardTitle>Comments</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <CommentList candidateId={candidateId} initialVisibility="all" />
        <div className="border-t pt-3">
          <CommentComposer entityType="candidate" entityId={candidateId} defaultVisibility={defaultVis as any} />
        </div>
      </CardContent>
    </Card>
  );
}

