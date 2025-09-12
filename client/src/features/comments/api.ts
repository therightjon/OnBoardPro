import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest, parseJsonSafe } from '@/lib/queryClient';
import { useAuth } from '@/features/auth/hooks/use-auth';

export function useCandidateComments(candidateId: string, visibility: 'all'|'internal'|'external') {
  const { user } = useAuth();
  return useInfiniteQuery({
    // Include user id to avoid cross-user cache reuse of visibility-scoped data
    queryKey: ['/api/candidates', candidateId, 'comments', { visibility }, user?.id],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      if (visibility !== 'all') params.set('visibility', visibility);
      if (pageParam) params.set('cursor', pageParam as string);
      const res = await apiRequest('GET', `/api/candidates/${candidateId}/comments?${params}`);
      return parseJsonSafe(res);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!candidateId && !!user,
  });
}

export function useTaskComments(taskId: string, visibility: 'all'|'internal'|'external') {
  const { user } = useAuth();
  return useInfiniteQuery({
    // Include user id to avoid cross-user cache reuse of visibility-scoped data
    queryKey: ['/api/tasks', taskId, 'comments', { visibility }, user?.id],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      if (visibility !== 'all') params.set('visibility', visibility);
      if (pageParam) params.set('cursor', pageParam as string);
      const res = await apiRequest('GET', `/api/tasks/${taskId}/comments?${params}`);
      return parseJsonSafe(res);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !!taskId && !!user,
  });
}

export function useCommentStats(candidateId: string) {
  const { user } = useAuth();
  return useQuery({
    // Include user id to ensure role/visibility-specific stats are not shared
    queryKey: ['/api/candidates', candidateId, 'comment-stats', user?.id],
    enabled: !!candidateId && !!user,
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/candidates/${candidateId}/comment-stats`);
      return parseJsonSafe(res);
    }
  });
}

export function useCreateCandidateComment(candidateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { body: string; visibility: 'internal'|'external'; parentId?: string }) => {
      const res = await apiRequest('POST', `/api/candidates/${candidateId}/comments`, payload);
      return parseJsonSafe(res);
    },
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: ['/api/candidates', candidateId, 'comment-stats'] });
      const prevStats = qc.getQueryData(['/api/candidates', candidateId, 'comment-stats']);
      qc.setQueryData(['/api/candidates', candidateId, 'comment-stats'], (d: any) => {
        if (!d) return d;
        const profile = { ...d.profile };
        profile.totalVisible = (profile.totalVisible ?? 0) + 1;
        if (payload.visibility === 'internal') profile.internalCount = (profile.internalCount ?? 0) + 1;
        if (payload.visibility === 'external') profile.externalCount = (profile.externalCount ?? 0) + 1;
        return { ...d, profile };
      });
      return { prevStats };
    },
    onError: (_err, _vars, ctx: any) => {
      if (ctx?.prevStats) qc.setQueryData(['/api/candidates', candidateId, 'comment-stats'], ctx.prevStats);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/candidates', candidateId, 'comments'] });
      qc.invalidateQueries({ queryKey: ['/api/candidates', candidateId, 'comment-stats'] });
    }
  });
}

export function useCreateTaskComment(taskId: string, candidateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { body: string; visibility: 'internal'|'external'; parentId?: string }) => {
      const res = await apiRequest('POST', `/api/tasks/${taskId}/comments`, payload);
      return parseJsonSafe(res);
    },
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: ['/api/candidates', candidateId, 'comment-stats'] });
      const prevStats = qc.getQueryData(['/api/candidates', candidateId, 'comment-stats']);
      qc.setQueryData(['/api/candidates', candidateId, 'comment-stats'], (d: any) => {
        if (!d) return d;
        const profile = { ...d.profile };
        profile.totalVisible = (profile.totalVisible ?? 0) + 1;
        if (payload.visibility === 'internal') profile.internalCount = (profile.internalCount ?? 0) + 1;
        if (payload.visibility === 'external') profile.externalCount = (profile.externalCount ?? 0) + 1;
        const byTask = { ...(d.byTask || {}) };
        const cur = byTask[taskId] || { internalCount: 0, externalCount: 0, totalVisible: 0 };
        const next = { ...cur } as any;
        next.totalVisible = (next.totalVisible ?? 0) + 1;
        if (payload.visibility === 'internal') next.internalCount = (next.internalCount ?? 0) + 1;
        if (payload.visibility === 'external') next.externalCount = (next.externalCount ?? 0) + 1;
        byTask[taskId] = next;
        return { ...d, profile, byTask };
      });
      return { prevStats };
    },
    onError: (_err, _vars, ctx: any) => {
      if (ctx?.prevStats) qc.setQueryData(['/api/candidates', candidateId, 'comment-stats'], ctx.prevStats);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/tasks', taskId, 'comments'] });
      qc.invalidateQueries({ queryKey: ['/api/candidates', candidateId, 'comment-stats'] });
    }
  });
}

export function useEditComment(params: { candidateId?: string; taskId?: string }) {
  const qc = useQueryClient();
  const { candidateId, taskId } = params;
  return useMutation({
    mutationFn: async (payload: { id: string; body: string }) => {
      const res = await apiRequest('PATCH', `/api/comments/${payload.id}`, { body: payload.body });
      return parseJsonSafe(res);
    },
    onMutate: async (payload) => {
      // Cancel outgoing refetches
      if (candidateId) await qc.cancelQueries({ queryKey: ['/api/candidates', candidateId, 'comments'] });
      if (taskId) await qc.cancelQueries({ queryKey: ['/api/tasks', taskId, 'comments'] });

      const prevCandidate = candidateId ? qc.getQueriesData({ queryKey: ['/api/candidates', candidateId, 'comments'] }) : [];
      const prevTask = taskId ? qc.getQueriesData({ queryKey: ['/api/tasks', taskId, 'comments'] }) : [];

      const patch = (data: any) => {
        if (!data) return data;
        const pages = (data.pages || []).map((p: any) => ({
          ...p,
          items: (p.items || []).map((it: any) => (it.id === payload.id ? { ...it, body: payload.body } : it))
        }));
        return { ...data, pages };
      };

      if (candidateId) {
        qc.setQueriesData({ queryKey: ['/api/candidates', candidateId, 'comments'], exact: false }, patch);
      }
      if (taskId) {
        qc.setQueriesData({ queryKey: ['/api/tasks', taskId, 'comments'], exact: false }, patch);
      }

      return { prevCandidate, prevTask };
    },
    onError: (_err, _vars, ctx: any) => {
      if (ctx?.prevCandidate) {
        for (const [key, data] of ctx.prevCandidate) {
          qc.setQueryData(key as any, data);
        }
      }
      if (ctx?.prevTask) {
        for (const [key, data] of ctx.prevTask) {
          qc.setQueryData(key as any, data);
        }
      }
    },
    onSettled: () => {
      if (candidateId) {
        qc.invalidateQueries({ queryKey: ['/api/candidates', candidateId, 'comments'] });
        qc.invalidateQueries({ queryKey: ['/api/candidates', candidateId, 'comment-stats'] });
      }
      if (taskId) {
        qc.invalidateQueries({ queryKey: ['/api/tasks', taskId, 'comments'] });
      }
    }
  });
}

export function useDeleteComment(params: { candidateId?: string; taskId?: string }) {
  const qc = useQueryClient();
  const { candidateId, taskId } = params;
  return useMutation({
    mutationFn: async (payload: { id: string }) => {
      await apiRequest('DELETE', `/api/comments/${payload.id}`);
    },
    onMutate: async (payload) => {
      if (candidateId) await qc.cancelQueries({ queryKey: ['/api/candidates', candidateId, 'comments'] });
      if (taskId) await qc.cancelQueries({ queryKey: ['/api/tasks', taskId, 'comments'] });

      const prevCandidate = candidateId ? qc.getQueriesData({ queryKey: ['/api/candidates', candidateId, 'comments'] }) : [];
      const prevTask = taskId ? qc.getQueriesData({ queryKey: ['/api/tasks', taskId, 'comments'] }) : [];

      const remove = (data: any) => {
        if (!data) return data;
        let removedTotal = 0;
        const pages = (data.pages || []).map((p: any) => {
          const before = (p.items || []).length;
          const newItems = (p.items || []).filter((it: any) => it.id !== payload.id && it.parentId !== payload.id);
          const delta = before - newItems.length;
          removedTotal += delta;
          return { ...p, items: newItems };
        });
        if (pages.length > 0) {
          pages[0] = {
            ...pages[0],
            totalVisibleCount: Math.max(0, (pages[0].totalVisibleCount ?? 0) - removedTotal)
          };
        }
        return { ...data, pages };
      };

      if (candidateId) {
        // Remove from lists and adjust overall count by total removed
        let removedCount = 0;
        const captureRemove = (data: any) => {
          if (!data) return data;
          let localRemoved = 0;
          const pages = (data.pages || []).map((p: any) => {
            const before = (p.items || []).length;
            const newItems = (p.items || []).filter((it: any) => it.id !== payload.id && it.parentId !== payload.id);
            localRemoved += before - newItems.length;
            return { ...p, items: newItems };
          });
          removedCount = localRemoved;
          if (pages.length > 0) {
            pages[0] = { ...pages[0], totalVisibleCount: Math.max(0, (pages[0].totalVisibleCount ?? 0) - removedCount) };
          }
          return { ...data, pages };
        };
        qc.setQueriesData({ queryKey: ['/api/candidates', candidateId, 'comments'], exact: false }, captureRemove);
        qc.setQueriesData({ queryKey: ['/api/candidates', candidateId, 'comment-stats'] }, (d: any) => d ? { ...d, profile: { ...d.profile, totalVisible: Math.max(0, (d.profile.totalVisible ?? 0) - removedCount) } } : d);
      }
      if (taskId) {
        qc.setQueriesData({ queryKey: ['/api/tasks', taskId, 'comments'], exact: false }, remove);
      }

      return { prevCandidate, prevTask };
    },
    onError: (_err, _vars, ctx: any) => {
      if (ctx?.prevCandidate) {
        for (const [key, data] of ctx.prevCandidate) {
          qc.setQueryData(key as any, data);
        }
      }
      if (ctx?.prevTask) {
        for (const [key, data] of ctx.prevTask) {
          qc.setQueryData(key as any, data);
        }
      }
    },
    onSettled: () => {
      if (candidateId) {
        qc.invalidateQueries({ queryKey: ['/api/candidates', candidateId, 'comments'] });
        qc.invalidateQueries({ queryKey: ['/api/candidates', candidateId, 'comment-stats'] });
      }
      if (taskId) {
        qc.invalidateQueries({ queryKey: ['/api/tasks', taskId, 'comments'] });
      }
    }
  });
}
