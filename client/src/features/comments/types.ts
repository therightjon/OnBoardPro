export type CommentVisibility = 'internal' | 'external';

export interface CommentDto {
  id: string;
  entityType: 'candidate' | 'task';
  entityId: string;
  author: { id: string; firstName: string; lastName: string };
  body: string;
  visibility: CommentVisibility;
  parentId?: string | null;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CommentStats {
  profile: { internalCount: number; externalCount: number; totalVisible: number };
  byTask: Record<string, { internalCount: number; externalCount: number; totalVisible: number }>;
}

