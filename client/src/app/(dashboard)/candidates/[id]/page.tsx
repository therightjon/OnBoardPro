import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { invalidateMyTasks } from "@/lib/query-invalidate";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { ArrowLeft, Edit, Calendar, User, Mail, Building, Clock, Users, CheckCircle, MoreHorizontal, Archive, RotateCcw, ChevronDown } from "lucide-react";
import { Link, useParams } from "wouter";
import { format } from "date-fns";
import { TaskStatusCell } from "@/features/tasks/components/task-status-cell";
import { useCommentStats } from "@/features/comments/api";
import { TaskCommentsButton } from "@/features/comments/components/task-comments-button";
import { TaskCommentsModal } from "@/features/comments/components/task-comments-modal";
import { CommentsTab } from "@/features/comments/components/comments-tab";
// Lazy load heavy dialogs to reduce initial bundle size
const EditCandidateDialog = lazy(() => import("@/features/candidates/components/edit-candidate-dialog").then(m => ({ default: m.EditCandidateDialog })));
const ArchiveCandidateDialog = lazy(() => import("@/features/candidates/components/archive-candidate-dialog").then(m => ({ default: m.ArchiveCandidateDialog })));
import { candidateStatusBadgeClass, isCandidateFullyOnboarded, resolveCandidateStatus, summarizeCandidateTasks, type ResolvedCandidateStatus } from "@/features/candidates/utils/status";
import { HiringProgress } from "@/features/candidates/components/hiring-progress";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/shared/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { Textarea } from "@/shared/components/ui/textarea";
import { AutoSelectCombobox } from "@/shared/components/inputs/AutoSelectCombobox";
import { PaginationControls } from "@/shared/components/pagination-controls";
import { useToast } from "@/shared/hooks/use-toast";

const dateOnlyIsoRegex = /^\d{4}-\d{2}-\d{2}$/;
const normalizeIso = (iso: string) => (dateOnlyIsoRegex.test(iso) ? `${iso}T00:00:00.000Z` : iso);
const readableDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

type TaskNote = {
  text: string;
  author?: string;
  createdAt?: string;
};

const getUtcMidnightMs = (iso: string) => {
  const normalized = normalizeIso(iso);
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};

const daysSince = (iso?: string | null) => {
  if (!iso) return null;
  const target = getUtcMidnightMs(iso);
  if (target === null) return null;
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const diff = Math.floor((today - target) / (1000 * 60 * 60 * 24));
  return diff >= 0 ? diff : null;
};

const formatUtcDate = (iso?: string | null) => {
  if (!iso) return "Not set";
  const normalized = normalizeIso(iso);
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "Not set";
  return readableDateFormatter.format(date);
};

const parseTaskNotes = (raw: any): TaskNote[] => {
  if (!raw) return [];
  const extractAuthorFromText = (text: string): string | undefined => {
    const match = text.match(/\bby\s+([^:]+)(?::|$)/i);
    return match ? match[1].trim() : undefined;
  };

  try {
    if (Array.isArray(raw)) {
      return (raw as any[]).filter((n) => n && typeof n === 'object' && n.text).map((n: any) => {
        const text = String(n.text);
        const author = n.author ? String(n.author) : extractAuthorFromText(text);
        return {
          text,
          author,
          createdAt: n.createdAt ? String(n.createdAt) : undefined
        };
      });
    }
    if (typeof raw === 'string') {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((n: any) => n && typeof n === 'object' && n.text).map((n: any) => {
          const text = String(n.text);
          const author = n.author ? String(n.author) : extractAuthorFromText(text);
          return {
            text,
            author,
            createdAt: n.createdAt ? String(n.createdAt) : undefined
          };
        });
      }
    }
  } catch (_) {
    // fall through to text parsing
  }

  const text = typeof raw === 'string' ? raw : '';
  const parts = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return parts.map((p) => ({ text: p, author: extractAuthorFromText(p) }));
};

const serializeNotes = (notes: TaskNote[]) => JSON.stringify(notes);

const buildAssigneeNoteEntry = (reason: string, nextAssigneeName: string, author?: string): TaskNote => {
  const trimmedReason = reason.trim();
  const base = `Assignee changed to ${nextAssigneeName || 'Unassigned'}`;
  const text = trimmedReason ? `${base}: ${trimmedReason}` : base;
  return {
    text,
    author,
    createdAt: new Date().toISOString()
  };
};

const sortNotesDesc = (notes: TaskNote[]) => {
  return [...notes].sort((a, b) => {
    const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });
};

export default function CandidateDetailPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params.id[0] : '';
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const [openTaskComments, setOpenTaskComments] = useState<{ id: string; title?: string } | null>(null);
  const [pendingAssignees, setPendingAssignees] = useState<Record<string, string | null>>({});
  const [assigneePrompt, setAssigneePrompt] = useState<{
    taskId: string;
    taskTitle: string;
    nextAssigneeId: string | null;
    nextAssigneeName: string;
    previousNotes: string | null | undefined;
  } | null>(null);
  const [assigneeNote, setAssigneeNote] = useState("");
  const [openNotesModal, setOpenNotesModal] = useState<{ title: string; notes: TaskNote[]; fallbackTimestamp?: string | null } | null>(null);
  const [notesPage, setNotesPage] = useState(1);

  const { data: candidate, isLoading: candidateLoading, error: candidateError } = useQuery({
    queryKey: ["/api/candidates", id],
    enabled: !!id && id !== 'undefined',
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/candidates/${id}`);
      return res.json();
    }
  });

  const { data: candidateTasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ["/api/candidates", id, "tasks"],
    enabled: !!id && id !== 'undefined',
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/candidates/${id}/tasks`);
      return res.json();
    }
  });

  const { data: candidateStages = [], isLoading: stagesLoading } = useQuery({
    queryKey: ["/api/candidates", id, "stages"],
    enabled: !!id && id !== 'undefined',
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/candidates/${id}/stages`);
      return res.json();
    }
  });

  const { data: stageHistoryData, isLoading: historyLoading } = useQuery({
    queryKey: ["/api/candidates", id, "stage-history"],
    enabled: !!id && id !== 'undefined',
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/candidates/${id}/stage-history`);
      return res.json();
    }
  });

  const { data: assignableUsers = [], isLoading: assigneesLoading, error: assigneeError } = useQuery({
    queryKey: ["/api/users/assignable"],
    enabled: !!user,
  });

  const recomputeDueDatesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/candidates/${id}/recompute-due-dates`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || 'Failed to refresh due dates');
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", id, "tasks"] });
      toast({ title: "Due dates refreshed", description: "Pending anchor tasks were re-evaluated." });
    },
    onError: (error: any) => {
      toast({ title: "Unable to refresh", description: error?.message || "Please try again." });
    }
  });

  const stageHistory = (stageHistoryData as any)?.history || [];
  const { data: commentStats } = useCommentStats(id);

  // Build order map from snapshotted stages
  const orderMap = useMemo(() => {
    const m = new Map<string, number>();
    (candidateStages as any[]).forEach((s: any) => m.set(s.stageId, s.orderIndex));
    return m;
  }, [candidateStages]);

  // Attach order for stable sorting and map field names from API
  const tasksWithOrder = useMemo(
    () => (candidateTasks as any[]).map((t: any) => {
      const fallbackAssigneeId = t.assigneeUserId ?? t.assignee_user_id ?? t.assignee_id ?? null;
      const fallbackAssignee = t.assignee ?? (
        t.assignee_firstName || t.assignee_lastName
          ? {
              id: fallbackAssigneeId,
              firstName: t.assignee_firstName,
              lastName: t.assignee_lastName
            }
          : null
      );

      return {
        ...t,
        // Map field names from new API structure
        stageId: t.stage_id,
        stageName: t.stage_name,
        stageOrderIndex: t.stage_order_index ?? orderMap.get(t.stage_id) ?? Number.MAX_SAFE_INTEGER,
        dueAt: t.dueAt,
        assignee: fallbackAssignee,
        assigneeUserId: fallbackAssigneeId,
        assigneeName: t.assignee_name ?? (fallbackAssignee ? `${fallbackAssignee.firstName ?? ''} ${fallbackAssignee.lastName ?? ''}`.trim() : undefined),
        priorityName: t.priority_name,
        categoryName: t.category_name,
        updatedAt: t.updated_at,
        phaseSnapshot: t.phase_snapshot
      };
    }),
    [candidateTasks, orderMap]
  );

  const assigneeLookup = useMemo(() => {
    const map = new Map<string, { id: string; firstName: string; lastName: string }>();
    (assignableUsers as any[]).forEach((u: any) => {
      if (u?.id) {
        map.set(u.id, { id: u.id, firstName: u.firstName, lastName: u.lastName });
      }
    });
    (tasksWithOrder as any[]).forEach((t: any) => {
      if (t.assigneeUserId && !map.has(t.assigneeUserId)) {
        const first = t.assignee?.firstName ?? '';
        const last = t.assignee?.lastName ?? '';
        map.set(t.assigneeUserId, { id: t.assigneeUserId, firstName: first, lastName: last });
      }
    });
    return map;
  }, [assignableUsers, tasksWithOrder]);

  const assigneeOptions = useMemo(
    () => {
      const opts = new Map<string, { id: string; name: string; firstName?: string; lastName?: string }>();
      opts.set('none', { id: 'none', name: 'Unassigned' });
      (assignableUsers as any[]).forEach((u: any) => {
        if (u?.id) {
          opts.set(u.id, { id: u.id, name: `${u.firstName} ${u.lastName}`, firstName: u.firstName, lastName: u.lastName });
        }
      });
      (tasksWithOrder as any[]).forEach((t: any) => {
        if (t.assigneeUserId && !opts.has(t.assigneeUserId)) {
          const fallbackName = t.assignee?.firstName || t.assignee?.lastName
            ? `${t.assignee.firstName ?? ''} ${t.assignee.lastName ?? ''}`.trim()
            : (t.assigneeName ?? '');
          opts.set(t.assigneeUserId, { id: t.assigneeUserId, name: fallbackName || 'Unassigned' });
        }
      });
      return Array.from(opts.values());
    },
    [assignableUsers, tasksWithOrder]
  );

  const pendingAnchorTasks = useMemo(() => (
    tasksWithOrder.filter((task: any) => task.pendingAnchor)
  ), [tasksWithOrder]);

  // Group by stage_id using snapshotted order
  const tasksByStage = useMemo(() => {
    const groups = new Map<string, { name: string; order: number; items: any[] }>();

    for (const task of tasksWithOrder) {
      const key = task.stageId ?? 'none';
      const order = task.stageOrderIndex;
      const name = (candidateStages as any[]).find((s: any) => s.stageId === key)?.stageNameSnapshot
                   ?? task.stageName
                   ?? 'Unassigned';

      if (!groups.has(key)) {
        groups.set(key, { name, order, items: [] });
      }
      groups.get(key)!.items.push(task);
    }

    // Convert to array and sort by order, then sort items within each group by due date
    return [...groups.values()]
      .sort((a, b) => a.order - b.order)
      .reduce((acc: any, group) => {
        // Sort tasks within group by due date
        const sortedTasks = group.items.sort((a: any, b: any) => {
          if (!a.dueAt && !b.dueAt) return 0;
          if (!a.dueAt) return 1;
          if (!b.dueAt) return -1;
          return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
        });
        acc[group.name] = sortedTasks;
        return acc;
      }, {});
  }, [tasksWithOrder, candidateStages]);

  // Compute onboarding completion: all tasks are either done or canceled
  const allTasksFlat = useMemo(() => (Object.values(tasksByStage).flat() as any[]), [tasksByStage]);
  const taskSummary = summarizeCandidateTasks(allTasksFlat);
  const hasAnyTasks = allTasksFlat.length > 0;

  // Automatically set status to completed when onboarding is complete (excluding canceled/archived/offer_declined)
  useEffect(() => {
    // no-op on server / ensure candidate exists
    if (!candidate) return;
    const status = (candidate as any).status as string | undefined;
    // Only auto-complete when every task is actually done (no canceled) and status isn't already terminal
    const shouldAutoComplete = taskSummary.allDone;
    if (!shouldAutoComplete) return;
    if (!status || status === 'completed' || status === 'canceled' || status === 'offer_declined' || status === 'archived') return;
    // Fire-and-forget status update; ignore errors here and let manual update handle it
    (async () => {
      try {
        await apiRequest('PATCH', `/api/candidates/${(candidate as any).id}/status`, { status: 'completed' });
        // Invalidate related queries to refresh UI
        queryClient.invalidateQueries({ queryKey: ["/api/candidates", (candidate as any).id] });
        queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
      } catch (_) {
        // Silently ignore; user can manually adjust if needed
      }
    })();
  }, [candidate, taskSummary.allDone, queryClient]);

  const candidatePhase = (candidate as any)?.currentStage?.phase ?? "pre_hire";
  const candidatePhaseLabel = candidatePhase === "onboarding" ? "Onboarding" : "Pre-hire";
  const pendingAnchorCount = pendingAnchorTasks.length;
  const hasPendingAnchor = pendingAnchorCount > 0;
  const looAnchor = (candidate as any)?.offerLetterAcceptedAt ?? (candidate as any)?.offerLetterIssuedAt ?? null;
  const anchorSourceLabel = looAnchor
    ? (candidate as any)?.offerLetterAcceptedAt ? "LOO Accepted" : "LOO Issued"
    : (candidate as any)?.anticipatedStartDate ? "Anticipated Start" : "Anchor not set";
  const anchorDate = looAnchor ?? (candidate as any)?.anticipatedStartDate ?? null;
  const daysSinceLoo = daysSince(looAnchor);
  const anchorDateLabel = formatUtcDate(anchorDate);

  const candidateId = (candidate as any)?.id || id;
  const resolvedStatus = resolveCandidateStatus(candidate as any);
  const candidateStatusKey = resolvedStatus.status === 'unknown'
    ? ((candidate as any)?.status || 'draft')
    : resolvedStatus.status;
  const fullyOnboarded = isCandidateFullyOnboarded(candidate as any, allTasksFlat);
  const taskStatusDisabled = fullyOnboarded ||
    !['draft', 'active', 'on_hold'].includes(candidateStatusKey);
  const assigneeSelectLocked = taskStatusDisabled || !!assigneeError;

  const currentStageName = (candidate as any)?.currentStage?.name || "Not set";
  const stageDisplay = resolvedStatus.isArchived
    ? (currentStageName === "Not set" ? "Archived" : `${currentStageName} (Archived)`)
    : resolvedStatus.isCanceled
      ? (currentStageName === "Not set" ? "Canceled" : `${currentStageName} (Canceled)`)
      : resolvedStatus.isOfferDeclined
        ? (currentStageName === "Not set" ? "Offer Declined" : `${currentStageName} (Offer Declined)`)
        : fullyOnboarded
          ? "Fully Onboarded!"
          : currentStageName;
  const stageClassName = fullyOnboarded
    ? "text-xs xs:text-sm font-bold text-green-700 dark:text-emerald-300 break-words"
    : "text-xs xs:text-sm text-muted-foreground break-words";

  const getAssigneeDisplayName = (task: any) => {
    if (task?.assignee?.firstName || task?.assignee?.lastName) {
      const first = task.assignee.firstName ?? '';
      const last = task.assignee.lastName ?? '';
      const combined = `${first} ${last}`.trim();
      return combined || 'Unassigned';
    }
    if (task?.assigneeName) return task.assigneeName;
    return 'Unassigned';
  };

  const getAssigneeNameById = (assigneeId: string | null | undefined) => {
    if (!assigneeId) return 'Unassigned';
    const match = assigneeLookup.get(assigneeId);
    if (match) {
      const name = `${match.firstName ?? ''} ${match.lastName ?? ''}`.trim();
      return name || 'Unassigned';
    }
    return 'Unassigned';
  };

  const buildAssigneeNote = (existingNotes: string | null | undefined, note: string, nextAssigneeName: string) => {
    const trimmed = note.trim();
    if (!trimmed) return existingNotes ?? '';
    const actor = user ? ` by ${user.firstName} ${user.lastName}` : '';
    const target = nextAssigneeName || 'Unassigned';
    const entry = `Assignee changed to ${target}${actor}: ${trimmed}`;
    const current = (existingNotes ?? '').trim();
    return current ? `${current}\n\n${entry}` : entry;
  };

  const clearAssigneeDraft = (taskId?: string) => {
    if (!taskId) {
      setPendingAssignees({});
      return;
    }
    setPendingAssignees((prev) => {
      const next = { ...prev };
      delete next[taskId];
      return next;
    });
  };

  const closeAssigneePrompt = () => {
    if (assigneePrompt) {
      clearAssigneeDraft(assigneePrompt.taskId);
    }
    setAssigneePrompt(null);
    setAssigneeNote('');
  };

  const updateAssigneeMutation = useMutation({
    mutationFn: async (vars: {
      taskId: string;
      candidateId: string;
      assigneeUserId: string | null;
      note: string;
      previousNotes: string | null | undefined;
      assigneeName: string;
    }) => {
      const payload: any = { assigneeUserId: vars.assigneeUserId ?? null };
      const entry = buildAssigneeNoteEntry(vars.note, vars.assigneeName, user ? `${user.firstName} ${user.lastName}` : undefined);
      const existingNotes = parseTaskNotes(vars.previousNotes);
      payload.notes = serializeNotes([entry, ...existingNotes]);
      const res = await apiRequest('PATCH', `/api/tasks/${vars.taskId}`, payload);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || 'Failed to update assignee');
      }
      return { ...data, appliedNotes: payload.notes };
    },
    onMutate: async (vars) => {
      const taskKey = ['/api/candidates', vars.candidateId, 'tasks'];
      await queryClient.cancelQueries({ queryKey: taskKey });
      const previous = queryClient.getQueryData<any[]>(taskKey);

      const optimisticUser = vars.assigneeUserId ? assigneeLookup.get(vars.assigneeUserId) : null;
      const optimisticName = vars.assigneeUserId
        ? (optimisticUser ? `${optimisticUser.firstName} ${optimisticUser.lastName}` : vars.assigneeName)
        : 'Unassigned';
      const entry = buildAssigneeNoteEntry(vars.note, optimisticName, user ? `${user.firstName} ${user.lastName}` : undefined);
      const optimisticNotes = serializeNotes([entry, ...parseTaskNotes(vars.previousNotes)]);

      queryClient.setQueryData<any[]>(taskKey, (old = []) =>
        old.map((t: any) => t.id === vars.taskId ? {
          ...t,
          assigneeUserId: vars.assigneeUserId,
          assignee: vars.assigneeUserId ? {
            id: vars.assigneeUserId,
            firstName: optimisticUser?.firstName || vars.assigneeName.split(' ')[0] || '',
            lastName: optimisticUser?.lastName || vars.assigneeName.split(' ').slice(1).join(' ') || ''
          } : null,
          assigneeName: optimisticName,
          notes: optimisticNotes
        } : t)
      );

      clearAssigneeDraft(vars.taskId);
      setAssigneePrompt(null);
      setAssigneeNote('');

      return { previous, taskKey };
    },
    onError: (error: any, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(ctx.taskKey, ctx.previous);
      toast({
        title: "Unable to update assignee",
        description: error?.message || "Please try again.",
        variant: "destructive"
      });
    },
    onSuccess: (data, vars) => {
      const update = (data as any) ?? {};
      const updatedTask = update.task;

      if (updatedTask) {
        queryClient.setQueryData(['/api/candidates', vars.candidateId, 'tasks'], (old: any[] = []) =>
          old.map((t) => t.id === updatedTask.id ? { ...t, ...updatedTask, notes: update.appliedNotes ?? updatedTask.notes } : t)
        );
      }

      if (update.candidate && update.advancement?.advanced) {
        queryClient.setQueryData(['/api/candidates', vars.candidateId], (old: any) =>
          old ? {
            ...old,
            currentStageId: update.candidate.current_stage_id,
            updatedAt: update.candidate.updated_at
          } : old
        );
      }

      queryClient.invalidateQueries({ queryKey: ['/api/candidates', vars.candidateId, 'tasks'] });
      queryClient.invalidateQueries({ queryKey: ['/api/candidates', vars.candidateId] });
      queryClient.invalidateQueries({ queryKey: ['/api/candidates', vars.candidateId, 'stage-history'] });
      queryClient.invalidateQueries({ queryKey: ['/api/candidates', vars.candidateId, 'estimate', { businessDays: true }] });
      queryClient.invalidateQueries({ queryKey: ['/api/candidates'] });
      invalidateMyTasks(queryClient);

      toast({
        title: "Assignee updated",
        description: vars.assigneeUserId ? `Task assigned to ${vars.assigneeName}` : "Task unassigned",
      });
    }
  });

  const handleConfirmAssigneeChange = () => {
    if (!assigneePrompt || updateAssigneeMutation.isPending) return;
    updateAssigneeMutation.mutate({
      taskId: assigneePrompt.taskId,
      candidateId,
      assigneeUserId: assigneePrompt.nextAssigneeId,
      note: assigneeNote,
      previousNotes: assigneePrompt.previousNotes ?? null,
      assigneeName: assigneePrompt.nextAssigneeName
    });
  };

  if (candidateLoading) {
    return (
      <div className="space-y-4 xs:space-y-5 sm:space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 xs:h-8 bg-muted rounded w-1/4"></div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
            <div className="h-48 xs:h-64 bg-muted rounded"></div>
            <div className="lg:col-span-2 h-64 xs:h-96 bg-muted rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (candidateError) {
    console.error('Candidate fetch error:', candidateError);
    return (
      <div className="space-y-4 xs:space-y-5 sm:space-y-6">
        <div className="text-center py-6 xs:py-8">
          <h1 className="text-lg xs:text-xl sm:text-2xl font-bold text-foreground">Error loading candidate</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Error: {candidateError.message}</p>
          <p className="text-xs xs:text-sm text-muted-foreground mt-2 break-all">ID: {id}</p>
          <Link href="/candidates">
            <Button className="mt-4 min-h-[44px]">Back to Candidates</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!candidate) {
    return (
      <div className="space-y-4 xs:space-y-5 sm:space-y-6">
        <div className="text-center py-6 xs:py-8">
          <h1 className="text-lg xs:text-xl sm:text-2xl font-bold text-foreground">Candidate not found</h1>
          <p className="text-sm sm:text-base text-muted-foreground">The candidate you're looking for doesn't exist.</p>
          <p className="text-xs xs:text-sm text-muted-foreground mt-2 break-all">ID: {id}</p>
          <Link href="/candidates">
            <Button className="mt-4 min-h-[44px]">Back to Candidates</Button>
          </Link>
        </div>
      </div>
    );
  }

  const EditableStatusBadge = ({ candidate, user, tasks, onStatusChange, resolvedStatus, onRequestRestore }: { 
    candidate: any; 
    user: any; 
    tasks: any[];
    onStatusChange: () => void;
    resolvedStatus: ResolvedCandidateStatus;
    onRequestRestore: () => void;
  }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    const [pendingStatus, setPendingStatus] = useState<string>('');
    const { toast } = useToast();

    const updateStatusMutation = useMutation({
      mutationFn: async ({ status, closeOpenTasks }: { status: string; closeOpenTasks?: boolean }) => {
        const response = await apiRequest('PATCH', `/api/candidates/${candidate.id}/status`, { status, closeOpenTasks });
        return response.json();
      },
      onSuccess: (data) => {
        // Invalidate relevant caches
        queryClient.invalidateQueries({ queryKey: ['candidate', candidate.id] });
        queryClient.invalidateQueries({ queryKey: ['/api/candidates'] });
        queryClient.invalidateQueries({ queryKey: ['candidateTasks', candidate.id] });
        invalidateMyTasks(queryClient);

        // Show cascade results if tasks were closed
        if (data.cascaded?.closedTasks > 0) {
          toast({
            title: "Status updated with task closure",
            description: `Candidate status updated successfully. Closed ${data.cascaded.closedTasks} task(s).`,
          });
        } else {
          toast({
            title: "Status updated",
            description: "Candidate status has been updated successfully.",
          });
        }
        
        onStatusChange();
        setIsOpen(false);
        setShowConfirmDialog(false);
      },
      onError: (error: any) => {
        setShowConfirmDialog(false);
        toast({
          title: "Unable to update status",
          description: error.message || "Please try again or contact support if the issue persists.",
        });
      }
    });

    const getValidTransitions = (currentStatus: string) => {
      const transitions: Record<string, { value: string; label: string; destructive?: boolean }[]> = {
        'draft': [
          { value: 'active', label: 'Active' },
          { value: 'on_hold', label: 'On Hold' },
          { value: 'canceled', label: 'Canceled', destructive: true },
          { value: 'archived', label: 'Archived', destructive: true }
        ],
        'active': [
          { value: 'on_hold', label: 'On Hold' },
          { value: 'completed', label: 'Completed' },
          { value: 'canceled', label: 'Canceled', destructive: true },
          { value: 'archived', label: 'Archived', destructive: true }
        ],
        'on_hold': [
          { value: 'active', label: 'Active' },
          { value: 'canceled', label: 'Canceled', destructive: true },
          { value: 'archived', label: 'Archived', destructive: true }
        ],
        'completed': [
          { value: 'archived', label: 'Archived', destructive: true }
        ],
        'canceled': [
          { value: 'archived', label: 'Archived', destructive: true },
          { value: 'active', label: 'Restore to Active' }
        ],
        'offer_declined': [
          { value: 'archived', label: 'Archived', destructive: true },
          { value: 'active', label: 'Restore to Active' }
        ],
        'archived': [
          { value: 'active', label: 'Restore to Active' }
        ]
      };
      return transitions[currentStatus] || [];
    };

    const handleStatusSelect = (newStatus: string) => {
      if (candidate.archived && newStatus === 'active' && onRequestRestore) {
        setIsOpen(false);
        onRequestRestore();
        return;
      }

      const transitions = getValidTransitions(candidate.status);
      const transition = transitions.find(t => t.value === newStatus);
      
      setPendingStatus(newStatus);
      
      if (transition?.destructive) {
        setShowConfirmDialog(true);
      } else {
        // Direct update for non-destructive transitions
        updateStatusMutation.mutate({ status: newStatus });
      }
    };

    const handleConfirmStatusChange = (closeOpenTasks = false) => {
      updateStatusMutation.mutate({ 
        status: pendingStatus, 
        closeOpenTasks 
      });
    };

    // Only show editable for authorized roles and when not already fully onboarded
    const canEdit = (user?.role === 'system_admin' || user?.role === 'hr_staff') 
      && candidate?.status !== 'completed'
      && !fullyOnboarded;
    
    if (!canEdit) {
      return (
        <Badge className={candidateStatusBadgeClass(resolvedStatus.status)} data-testid="badge-candidate-status">
          {resolvedStatus.label.toUpperCase()}
        </Badge>
      );
    }

    const validTransitions = getValidTransitions(candidate.status);
    
    // Check if there are incomplete required tasks
    const hasIncompleteRequiredTasks = tasks.some(
      task => task.required && task.status !== 'done'
    );
    
    return (
      <>
        <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
          <DropdownMenuTrigger asChild>
            <button 
              className={`${candidateStatusBadgeClass(resolvedStatus.status)} inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium hover:opacity-80 transition-opacity`}
              data-testid="button-status-dropdown"
              disabled={updateStatusMutation.isPending}
            >
              {resolvedStatus.label.toUpperCase()}
              <ChevronDown className="w-3 h-3 ml-1" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" data-testid="dropdown-status-options">
            {validTransitions.map((transition) => {
              const isCompleted = transition.value === 'completed';
              const isDisabled = isCompleted && hasIncompleteRequiredTasks;
              
              if (isDisabled) {
                return (
                  <div
                    key={transition.value}
                    className="px-2 py-1.5 text-sm text-muted-foreground cursor-not-allowed"
                    data-testid={`option-status-${transition.value}-disabled`}
                  >
                    <div>{transition.label}</div>
                    <div className="text-xs mt-1">Complete all required tasks first</div>
                  </div>
                );
              }
              
              return (
                <DropdownMenuItem
                  key={transition.value}
                  onClick={() => handleStatusSelect(transition.value)}
                  className={transition.destructive ? "text-destructive focus:text-destructive" : ""}
                  data-testid={`option-status-${transition.value}`}
                >
                  {transition.label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Confirmation Dialog for Destructive Actions */}
        <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
          <AlertDialogContent data-testid="dialog-confirm-status">
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Status Change</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to change the candidate status to "{pendingStatus.replace('_', ' ')}"?
                {pendingStatus === 'canceled' && " You can optionally close all open tasks."}
                {pendingStatus === 'archived' && " This will archive the candidate and all their data."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-status">Cancel</AlertDialogCancel>
              {pendingStatus === 'canceled' && (
                <AlertDialogAction
                  onClick={() => handleConfirmStatusChange(true)}
                  className="bg-orange-600 hover:bg-orange-700"
                  data-testid="button-confirm-status-close-tasks"
                >
                  Cancel & Close Tasks
                </AlertDialogAction>
              )}
              <AlertDialogAction
                onClick={() => handleConfirmStatusChange(false)}
                className={pendingStatus === 'archived' ? "bg-destructive hover:bg-destructive/90" : ""}
                data-testid="button-confirm-status"
              >
                {pendingStatus === 'canceled' ? 'Cancel Only' : 'Confirm'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </>
    );
  };

  return (
    <div className="space-y-3 xs:space-y-4 sm:space-y-6 max-w-none xs:max-w-[350px] sm:max-w-4xl lg:max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="flex flex-col xs:flex-row xs:items-center gap-2 xs:gap-4 min-w-0">
          <Link href="/candidates">
            <Button variant="ghost" size="sm" className="min-h-[44px] w-full xs:w-auto" data-testid="button-back">
              <ArrowLeft className="w-4 h-4 xs:mr-2" />
              <span className="hidden xs:inline">Back to Candidates</span>
              <span className="inline xs:hidden">Candidates</span>
            </Button>
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2 xs:gap-3">
          <EditableStatusBadge 
            candidate={candidate} 
            user={user} 
            tasks={(candidateTasks as any[]) || []}
            onStatusChange={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/candidates", (candidate as any).id] });
              queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
            }}
            resolvedStatus={resolvedStatus}
            onRequestRestore={() => setIsArchiveDialogOpen(true)}
          />
          {resolvedStatus.isArchived && (
            <Badge variant="destructive" data-testid="badge-archived">
              ARCHIVED
            </Badge>
          )}
          
          {/* Edit and More actions - only show for authorized roles */}
          {(user?.role === 'system_admin' || user?.role === 'hr_staff') && (
            <>
              <Button 
                onClick={() => setIsEditDialogOpen(true)}
                className="min-h-[44px] w-full xs:w-auto"
                data-testid="button-edit-candidate"
                disabled={(candidate as any).status === 'completed'}
                title={(candidate as any).status === 'completed' ? 'Profile is locked after completion' : undefined}
              >
                <Edit className="w-4 h-4 xs:mr-2" />
                <span className="hidden xs:inline">Edit</span>
              </Button>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="min-h-[44px] min-w-[44px]" data-testid="button-more-actions">
                    <MoreHorizontal className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {(candidate as any).archived ? (
                    <DropdownMenuItem 
                      onClick={() => setIsArchiveDialogOpen(true)}
                      data-testid="menu-restore-candidate"
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Restore Candidate
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem 
                      onClick={() => setIsArchiveDialogOpen(true)}
                      className="text-destructive focus:text-destructive"
                      data-testid="menu-archive-candidate"
                    >
                      <Archive className="w-4 h-4 mr-2" />
                      Archive Candidate
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>

      {/* Full-width Candidate Information */}
      <Card>
        <CardHeader className="p-3 xs:p-4 sm:p-6">
          <CardTitle className="flex items-center text-base xs:text-lg sm:text-xl lg:text-3xl" data-testid="text-candidate-name">
            <User className="w-4 h-4 mr-2" />
            {(candidate as any).salutation ? `${(candidate as any).salutation} ` : ''}{(candidate as any).firstName} {(candidate as any).lastName}
          </CardTitle>
          {(() => {
            if (resolvedStatus.isArchived) {
              return (
                <div className="mt-4 p-4 bg-muted border border-muted-foreground/40 rounded-lg">
                  <p className="text-2xl font-bold text-muted-foreground text-center" data-testid="text-candidate-archived">
                    Candidate Archived
                  </p>
                </div>
              );
            }

            if (resolvedStatus.isCanceled) {
              return (
                <div className="mt-4 p-4 bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-lg">
                  <p className="text-2xl font-bold text-orange-700 dark:text-orange-300 text-center" data-testid="text-candidate-canceled">
                    Candidate Canceled
                  </p>
                </div>
              );
            }

            if (resolvedStatus.isOfferDeclined) {
              return (
                <div className="mt-4 p-4 bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-lg">
                  <p className="text-2xl font-bold text-orange-700 dark:text-orange-300 text-center" data-testid="text-offer-declined">
                    Offer Declined
                  </p>
                </div>
              );
            }

            return fullyOnboarded ? (
              <div className="mt-4 p-4 bg-green-50 dark:bg-emerald-950 border border-green-200 dark:border-emerald-700 rounded-lg">
                <p className="text-2xl font-bold text-green-700 dark:text-emerald-300 text-center" data-testid="text-onboarding-complete">
                  Onboarding Complete!
                </p>
              </div>
            ) : null;
          })()}
        </CardHeader>
        <CardContent className="p-3 xs:p-4 sm:p-6 pt-0">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {/* Contact Section */}
            <div className="space-y-3 xs:space-y-4">
              <h3 className="text-sm xs:text-base sm:text-lg font-semibold text-foreground border-b pb-2">Contact</h3>
              <dl className="space-y-2 xs:space-y-3">
                <div className="flex items-start space-x-3">
                  <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <dt className="text-xs xs:text-sm font-medium">Email</dt>
                    <dd className="text-xs xs:text-sm text-muted-foreground break-all" data-testid="text-candidate-email">{(candidate as any).email}</dd>
                  </div>
                </div>
              </dl>
            </div>

            {/* Employment Section */}
            <div className="space-y-3 xs:space-y-4">
              <h3 className="text-sm xs:text-base sm:text-lg font-semibold text-foreground border-b pb-2">Employment</h3>
              <dl className="space-y-2 xs:space-y-3">
                {/* Row 1: LOI Date | LOO Issued */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-start space-x-3">
                    <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <dt className="text-xs xs:text-sm font-medium">LOI Date</dt>
                      <dd className="text-xs xs:text-sm text-muted-foreground" data-testid="text-loi-date">{formatUtcDate((candidate as any)?.letterOfIntentDate)}</dd>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <dt className="text-xs xs:text-sm font-medium">LOO Issued</dt>
                      <dd className="text-xs xs:text-sm text-muted-foreground" data-testid="text-loo-issued">{formatUtcDate((candidate as any)?.offerLetterIssuedAt)}</dd>
                    </div>
                  </div>
                </div>

                {/* Row 2: LOO Accepted | Anticipated Start */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-start space-x-3">
                    <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <dt className="text-xs xs:text-sm font-medium">LOO Accepted</dt>
                      <dd className="text-xs xs:text-sm text-muted-foreground" data-testid="text-loo-accepted">{formatUtcDate((candidate as any)?.offerLetterAcceptedAt)}</dd>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <dt className="text-xs xs:text-sm font-medium">Anticipated Start</dt>
                      <dd className="text-xs xs:text-sm text-muted-foreground" data-testid="text-candidate-start-date">{formatUtcDate((candidate as any)?.anticipatedStartDate)}</dd>
                    </div>
                  </div>
                </div>

                {/* Row 3: Candidate Type | Faculty Rank */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-start space-x-3">
                    <Building className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <dt className="text-xs xs:text-sm font-medium">Candidate Type</dt>
                      <dd className="text-xs xs:text-sm text-muted-foreground">{(candidate as any).candidateType?.name || "Not set"}</dd>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <User className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <dt className="text-xs xs:text-sm font-medium">Faculty Rank</dt>
                      <dd className="text-xs xs:text-sm text-muted-foreground">{(candidate as any).facultyRank?.name || "N/A"}</dd>
                    </div>
                  </div>
                </div>

                {/* Row 4: Anchor in Use */}
                <div className="flex items-start space-x-3">
                  <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <dt className="text-xs xs:text-sm font-medium">Anchor in Use</dt>
                    <dd className="text-xs xs:text-sm text-muted-foreground">
                      {anchorDate ? (
                        <span>
                          {anchorSourceLabel}
                          {": "}
                          {anchorDateLabel}
                          {daysSinceLoo !== null && anchorSourceLabel.startsWith('LOO') ? ` · ${daysSinceLoo}d ago` : ''}
                        </span>
                      ) : (
                        "Not set"
                      )}
                    </dd>
                  </div>
                </div>
              </dl>
            </div>

            {/* Organization Section */}
            <div className="space-y-3 xs:space-y-4">
              <h3 className="text-sm xs:text-base sm:text-lg font-semibold text-foreground border-b pb-2">Organization</h3>
              <dl className="space-y-2 xs:space-y-3">
                <div className="flex items-start space-x-3">
                  <Building className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <dt className="text-xs xs:text-sm font-medium">Department</dt>
                    <dd className="text-xs xs:text-sm text-muted-foreground break-words">{(candidate as any).department?.name || "Not set"}</dd>
                  </div>
                </div>

                {(candidate as any).division && (
                  <div className="flex items-start space-x-3">
                    <Building className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <dt className="text-xs xs:text-sm font-medium">Division</dt>
                      <dd className="text-xs xs:text-sm text-muted-foreground break-words">{(candidate as any).division.name}</dd>
                    </div>
                  </div>
                )}

                {(candidate as any).manager && (
                  <div className="flex items-start space-x-3">
                    <Users className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <dt className="text-xs xs:text-sm font-medium">Manager</dt>
                      <dd className="text-xs xs:text-sm text-muted-foreground break-words">
                        {`${(candidate as any).manager.firstName} ${(candidate as any).manager.lastName}`}
                      </dd>
                    </div>
                  </div>
                )}
              </dl>
            </div>

            {/* Progress Section */}
            <div className="space-y-3 xs:space-y-4">
              <h3 className="text-sm xs:text-base sm:text-lg font-semibold text-foreground border-b pb-2">Progress</h3>
              
              {/* Current Hiring Stage */}
              <div className="flex items-start space-x-3">
                <CheckCircle className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-xs xs:text-sm font-medium">Current Hiring Stage</div>
                  <div className={stageClassName} data-testid="text-current-stage">
                    {stageDisplay}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1 capitalize">
                    Phase: {candidatePhaseLabel}
                  </div>
              </div>
            </div>

              {/* Pipeline Duration Estimate */}
              {(candidate as any).templateAppliedFromId && (
                <CandidatePipelineEstimate 
                  candidateId={(candidate as any).id}
                  status={(candidate as any).status}
                />
              )}
            </div>
          </div>

          {/* Template Information - Full Width */}
          {(candidate as any).templateAppliedFromId ? (
            <div className="mt-4 xs:mt-6 pt-4 xs:pt-6 border-t">
              <h3 className="text-sm xs:text-base sm:text-lg font-semibold text-foreground border-b pb-2 mb-3 xs:mb-4">Template Information</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 xs:gap-4 sm:gap-6">
                <div>
                  <dt className="text-xs xs:text-sm font-medium text-muted-foreground">Template</dt>
                  <dd className="text-sm xs:text-base mt-1 break-words">{(candidate as any).templateNameSnapshot || "Unknown Template"}</dd>
                </div>
                <div>
                  <dt className="text-xs xs:text-sm font-medium text-muted-foreground">Applied</dt>
                    <dd className="text-sm xs:text-base mt-1">{(candidate as any).templateAppliedAt ? formatUtcDate((candidate as any).templateAppliedAt) : "N/A"}</dd>
                </div>
                <div>
                  <dt className="text-xs xs:text-sm font-medium text-muted-foreground">Status</dt>
                  <dd className="mt-1">
                    {(candidate as any).templateLocked && (
                      <Badge variant="secondary">
                        Template Locked
                      </Badge>
                    )}
                  </dd>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4 xs:mt-6 pt-4 xs:pt-6 border-t">
              <div className="text-center py-4 xs:py-6">
                <h3 className="text-sm xs:text-base sm:text-lg font-semibold text-foreground mb-2">No Template Applied</h3>
                <p className="text-xs xs:text-sm text-muted-foreground mb-3 xs:mb-4">Apply a template to generate tasks and stages for this candidate</p>
                <Button size="sm" variant="outline" className="min-h-[44px]">
                  Apply Template
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Hiring Progress */}
      <HiringProgress
        candidate={{
          id: (candidate as any).id,
          letterOfIntentDate: (candidate as any).letterOfIntentDate,
          offerLetterIssuedAt: (candidate as any).offerLetterIssuedAt,
          offerLetterAcceptedAt: (candidate as any).offerLetterAcceptedAt,
          templateAppliedAt: (candidate as any).templateAppliedAt,
        }}
        isFullyOnboarded={fullyOnboarded}
      />

      {/* Tasks and Timeline Tabs */}
      <Card>
        <CardContent className="p-3 xs:p-4 sm:p-6">
          <Tabs defaultValue="tasks" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="tasks" className="" data-testid="tab-tasks">Tasks</TabsTrigger>
              <TabsTrigger value="comments" className="" data-testid="tab-comments">
                Comments{(commentStats as any)?.profile?.totalVisible ? ` (${(commentStats as any).profile.totalVisible})` : ''}
              </TabsTrigger>
              <TabsTrigger value="timeline" className="" data-testid="tab-timeline">Timeline</TabsTrigger>
            </TabsList>

            <TabsContent value="tasks" className="space-y-3 xs:space-y-4">
              {hasPendingAnchor && (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <div>
                    {pendingAnchorCount === 1 ? '1 task is waiting for anchor dates.' : `${pendingAnchorCount} tasks are waiting for anchor dates.`}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={recomputeDueDatesMutation.isPending}
                    onClick={() => recomputeDueDatesMutation.mutate()}
                  >
                    {recomputeDueDatesMutation.isPending ? 'Refreshing…' : 'Recompute due dates'}
                  </Button>
                </div>
              )}
              <Card>
                <CardHeader className="p-3 xs:p-4 sm:p-6">
                  <CardTitle className="text-base xs:text-lg sm:text-xl">Tasks by Stage</CardTitle>
                </CardHeader>
                <CardContent className="p-3 xs:p-4 sm:p-6 pt-0">
                  {tasksLoading ? (
                    <div className="space-y-4">
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="animate-pulse space-y-2">
                          <div className="h-4 bg-muted rounded w-1/4"></div>
                          <div className="h-16 bg-muted rounded"></div>
                        </div>
                      ))}
                    </div>
                  ) : Object.keys(tasksByStage).length === 0 ? (
                    !(candidate as any).templateAppliedFromId ? (
                      <div className="text-center py-6 xs:py-8">
                        <p className="text-sm text-muted-foreground mb-3 xs:mb-4">No tasks yet. Apply a template to generate tasks.</p>
                        <Button variant="outline" className="min-h-[44px]">
                          Apply Template
                        </Button>
                      </div>
                    ) : !(candidate as any).templateAppliedAt ? (
                      <div className="text-center py-6 xs:py-8">
                        <p className="text-sm text-muted-foreground">Tasks will be generated once the Letter of Offer is accepted.</p>
                        <p className="text-xs text-muted-foreground mt-2">Use the "LOO Accepted" button in Hiring Progress to record acceptance.</p>
                      </div>
                    ) : (
                      <p className="text-center text-muted-foreground py-6 xs:py-8 text-sm">No tasks found for this candidate</p>
                    )
                  ) : (
                    <div className="space-y-4 xs:space-y-6">
                      {Object.entries(tasksByStage).map(([stageName, tasks]: [string, any]) => (
                        <div key={stageName} className="space-y-2 xs:space-y-3">
                          <h3 className="text-sm xs:text-base font-semibold text-foreground border-b pb-2">
                            {stageName}
                          </h3>
                          <div className="space-y-2">
                            {(tasks as any[]).map((task: any) => (
                              <div key={task.id} className="border rounded-lg p-3 xs:p-4 hover:bg-muted/50 transition-colors" data-testid={`card-task-${task.id}`}>
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <h4 className="text-sm xs:text-base font-medium break-words min-w-0 flex items-center gap-2">
                                    {task.title}
                                    {task.status === 'canceled' && (
                                      <Badge variant="secondary" title={task.cancel_reason || ''}>CANCELED</Badge>
                                    )}
                                    {task.pendingAnchor && (
                                      <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300 bg-amber-50" title="Waiting for required anchor date">
                                        Pending anchor
                                      </Badge>
                                    )}
                                  </h4>
                                  <div className="flex items-center gap-4">
                                    {/* comments button injected here */}
                                    <TaskCommentsButton 
                                      count={(commentStats as any)?.byTask?.[task.id]?.totalVisible || 0}
                                      onClick={() => setOpenTaskComments({ id: task.id, title: task.title })}
                                      ariaLabel={`Open comments for task ${task.title}`}
                                    />
                                    <TaskStatusCell
                                      taskId={task.id}
                                      candidateId={(candidate as any).id}
                                      value={task.status}
                                      disabled={taskStatusDisabled}
                                    />
                                  </div>
                                </div>
                                {task.description && (
                                  <p className="text-xs xs:text-sm text-muted-foreground mb-2 break-words">{task.description}</p>
                                )}
                                <div className="flex flex-col gap-2 text-xs xs:text-sm text-muted-foreground">
                                  <div className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-1 xs:gap-2">
                                    <div className="flex flex-col xs:flex-row xs:flex-wrap gap-2 xs:gap-x-4 xs:gap-y-1 xs:items-center">
                                      <span>Priority: {task.priority?.toUpperCase()}</span>
                                      <div className="flex items-center gap-2 min-w-[180px]">
                                        <span className="text-muted-foreground">Assignee:</span>
                                        {assigneeSelectLocked ? (
                                          <span className="font-bold">
                                            {getAssigneeDisplayName(task)}
                                          </span>
                                        ) : (
                                          <div className="w-[170px] xs:w-[200px]">
                                            <AutoSelectCombobox
                                              label="Assignee"
                                              labelClassName="sr-only"
                                              size="sm"
                                              value={(pendingAssignees[task.id] ?? task.assignee?.id ?? task.assigneeUserId ?? 'none') as string}
                                              onChange={(id, item) => {
                                                const normalized = id === 'none' ? null : id;
                                                const current = task.assignee?.id ?? task.assigneeUserId ?? null;
                                                if (normalized === current) {
                                                  clearAssigneeDraft(task.id);
                                                  return;
                                                }
                                                const selectedName = item?.name ?? getAssigneeNameById(normalized);
                                                setAssigneeNote('');
                                                setAssigneePrompt({
                                                  taskId: task.id,
                                                  taskTitle: task.title,
                                                  nextAssigneeId: normalized,
                                                  nextAssigneeName: selectedName,
                                                  previousNotes: task.notes
                                                });
                                                setPendingAssignees((prev) => ({ ...prev, [task.id]: id ?? 'none' }));
                                              }}
                                              fetchItems={async (q: string) => {
                                                const query = q.trim().toLowerCase();
                                                const allOptions = assigneeOptions;
                                                // Show a small curated list when empty query: Unassigned + current + up to 3 others
                                                if (query.length === 0) {
                                                  const currentId = (pendingAssignees[task.id] ?? task.assignee?.id ?? task.assigneeUserId ?? 'none') as string;
                                                  const picked: any[] = [];
                                                  const seen = new Set<string>();
                                                  const addOption = (id: string) => {
                                                    const found = allOptions.find((o) => o.id === id);
                                                    if (found && !seen.has(id)) {
                                                      picked.push(found);
                                                      seen.add(id);
                                                    }
                                                  };
                                                  addOption('none');
                                                  addOption(currentId);
                                                  for (const opt of allOptions) {
                                                    if (picked.length >= 5) break;
                                                    if (!seen.has(opt.id)) addOption(opt.id);
                                                  }
                                                  return picked.slice(0, 5);
                                                }

                                                // For search, filter across full list but cap at 5, ensuring current (if matching) is included
                                                const currentId = (pendingAssignees[task.id] ?? task.assignee?.id ?? task.assigneeUserId ?? 'none') as string;
                                                const matches = allOptions.filter((opt) => opt.id === 'none' || opt.name.toLowerCase().includes(query));

                                                const results: typeof allOptions = [];
                                                const seen = new Set<string>();
                                                for (const opt of matches) {
                                                  if (results.length >= 5) break;
                                                  if (!seen.has(opt.id)) {
                                                    results.push(opt);
                                                    seen.add(opt.id);
                                                  }
                                                }

                                                const currentMatch = matches.find((m) => m.id === currentId);
                                                if (currentMatch && !seen.has(currentId)) {
                                                  if (results.length < 5) {
                                                    results.push(currentMatch);
                                                  } else {
                                                    // Replace the last non-current entry to keep size at 5
                                                    results[results.length - 1] = currentMatch;
                                                  }
                                                }

                                                return results.slice(0, 5);
                                              }}
                                              placeholder="Select assignee"
                                              disabled={assigneesLoading || updateAssigneeMutation.isPending || assigneeSelectLocked}
                                              data-testid={`select-task-assignee-${task.id}`}
                                            />
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    <span className="xs:ml-auto">
                                      {task.pendingAnchor
                                        ? 'Awaiting anchor date'
                                        : task.dueAt
                                          ? `Due: ${formatUtcDate(task.dueAt)}`
                                          : "No due date"}
                                    </span>
                                  </div>
                                </div>
                                {task.notes && (
                                  (() => {
                                    const notes = sortNotesDesc(parseTaskNotes(task.notes));
                                    if (!notes.length) return null;
                                    const latest = notes[0];
                                    const moreCount = notes.length - 1;
                                    return (
                                      <div className="mt-2 pt-2 border-t">
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                          <span className="font-semibold">Notes:</span>
                                          <span className="line-clamp-1 break-words">{latest.text}</span>
                                          {moreCount > 0 && (
                                            <Button
                                              variant="link"
                                              size="sm"
                                              className="p-0 h-auto text-xs"
                                              onClick={() => {
                                                setOpenNotesModal({
                                                  title: task.title,
                                                  notes,
                                                  fallbackTimestamp: task.updatedAt || task.updated_at || null
                                                });
                                                setNotesPage(1);
                                              }}
                                              aria-label={`View ${moreCount} more notes for ${task.title}`}
                                            >
                                              +{moreCount} more
                                            </Button>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })()
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="comments" className="space-y-4">
              <CommentsTab candidateId={(candidate as any).id} />
            </TabsContent>

            <TabsContent value="timeline" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 flex-wrap">
                    <Clock className="w-4 h-4" />
                    <span>Stage Timeline</span>
                    {fullyOnboarded && (
                      <span className="font-bold text-green-700 dark:text-emerald-300" data-testid="text-fully-onboarded-timeline">Fully Onboarded!</span>
                    )}
                    {(candidate as any).isBlockedByPriorStage && (candidate as any).blockerSummary?.earliestPriorStage && (
                      <span className="ml-auto inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/30" data-testid="pill-stage-blocked">
                        Blocked by {(candidate as any).blockerSummary.earliestPriorStage.name}
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {historyLoading ? (
                  <div className="space-y-4">
                    {[...Array(3)].map((_, i) => (
                    <div key={i} className="animate-pulse flex items-center space-x-4">
                      <div className="w-4 h-4 bg-muted rounded-full"></div>
                      <div className="flex-1 space-y-2">
                      <div className="h-4 bg-muted rounded w-1/4"></div>
                      <div className="h-3 bg-muted rounded w-1/2"></div>
                      </div>
                    </div>
                    ))}
                  </div>
                  ) : stageHistory.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No stage history for this candidate.
                  </p>
                  ) : (
                  (() => {
                    const sortedHistory = [...stageHistory].sort((a: any, b: any) => {
                      const da = a.changedAt ? new Date(a.changedAt).getTime() : 0;
                      const db = b.changedAt ? new Date(b.changedAt).getTime() : 0;
                      if (db !== da) return db - da; // Newest to oldest by time
                      const ca = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                      const cb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                      return cb - ca; // Fallback to createdAt
                    });
                    return (
                    <div className="space-y-4">
                      {(candidate as any).isBlockedByPriorStage && (candidate as any).blockerSummary?.priorOpenTasks?.length > 0 && (
                      <div className="p-3 rounded-md border bg-muted/30" data-testid="blocker-summary">
                        <div className="text-sm font-medium mb-2">Open tasks in prior stages</div>
                        <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                        {((candidate as any).blockerSummary.priorOpenTasks as any[]).map((t: any) => (
                          <li key={t.id}>
                          <span className="font-medium">{t.title}</span>
                          <span className="ml-2">({t.stageName})</span>
                          {t.dueAt && <span className="ml-2">Due: {formatUtcDate(t.dueAt)}</span>}
                          </li>
                        ))}
                        </ul>
                      </div>
                      )}
                      {sortedHistory.map((entry: any, index: number) => {
                        const regressed = (entry?.fromStage?.orderIndex ?? 0) > (entry?.stage?.orderIndex ?? 0);
                        return (
                      <div key={entry.id} className="flex items-start space-x-4">
                        <div className="flex flex-col items-center">
                        <div className="w-3 h-3 bg-primary rounded-full"></div>
                        {index < sortedHistory.length - 1 && (
                          <div className="w-px h-8 bg-border mt-2"></div>
                        )}
                        </div>
                        <div className="flex-1 pb-4">
                        <div className="flex items-center justify-between">
                          <h4 className="font-medium">{entry.stage?.name || 'Unknown Stage'}</h4>
                          <Badge variant="outline">
                          {entry.changedAt ? format(new Date(entry.changedAt), "MMM d, yyyy") : 'Unknown Date'}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          Changed by: {entry.changedBy ? `${entry.changedBy.firstName} ${entry.changedBy.lastName}` : 'Unknown User'}
                        </p>
                        {regressed && (
                          <p className="text-xs text-muted-foreground mt-1">Stage regressed due to a task reopening in a prior stage</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {entry.changedAt ? format(new Date(entry.changedAt), "h:mm a") : ''}
                        </p>
                        </div>
                      </div>
                        );
                      })}
                    </div>
                    );
                  })()
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={!!assigneePrompt} onOpenChange={(open) => { if (!open) closeAssigneePrompt(); }}>
        <DialogContent className="max-w-md max-h-min">
          <DialogHeader>
            <DialogTitle>Change assignee</DialogTitle>
            <DialogDescription>
              Add a short note explaining why you're changing the assignee.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {assigneePrompt?.taskTitle && (
              <p className="text-sm font-medium text-foreground break-words">{assigneePrompt.taskTitle}</p>
            )}
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="assignee-change-note">Reason for change</label>
              <Textarea
                id="assignee-change-note"
                value={assigneeNote}
                onChange={(e) => setAssigneeNote(e.target.value)}
                placeholder="Include a brief note"
                className="min-h-[96px]"
                required
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={closeAssigneePrompt} disabled={updateAssigneeMutation.isPending}>
                Cancel
              </Button>
              <Button 
                onClick={handleConfirmAssigneeChange}
                disabled={updateAssigneeMutation.isPending || assigneeNote.trim().length === 0}
              >
                {updateAssigneeMutation.isPending ? 'Saving...' : 'Confirm'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!openNotesModal} onOpenChange={(open) => { if (!open) { setOpenNotesModal(null); setNotesPage(1); } }}>
        <DialogContent className="sm:max-w-lg max-h-min">
          <DialogHeader>
            <DialogTitle>Assignee notes</DialogTitle>
            <DialogDescription>
              {openNotesModal?.title ? `Notes for ${openNotesModal.title}` : 'Notes'}
            </DialogDescription>
          </DialogHeader>
          {openNotesModal && (
            <div className="space-y-3">
              {(openNotesModal.notes.length === 0) ? (
                <p className="text-sm text-muted-foreground">No notes available.</p>
              ) : (
                <>
                  {(() => {
                    const pageSize = 5;
                    const start = (notesPage - 1) * pageSize;
                    const current = sortNotesDesc(openNotesModal.notes).slice(start, start + pageSize);
                    return (
                      <div className="space-y-3">
                        {current.map((note, idx) => (
                          <div key={`${note.createdAt ?? 'note'}-${idx}`} className="border rounded-md p-3">
                            <p className="text-sm text-foreground break-words">{note.text}</p>
                            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                              <span>{note.author || 'Unknown user'}</span>
                              <span aria-hidden>•</span>
                              <span>{note.createdAt ? format(new Date(note.createdAt), "PPP p") : (openNotesModal.fallbackTimestamp ? format(new Date(openNotesModal.fallbackTimestamp), "PPP p") : 'Unknown time')}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                  <PaginationControls
                    page={notesPage}
                    pageSize={5}
                    totalCount={openNotesModal.notes.length}
                    onPageChange={setNotesPage}
                    className="mt-2"
                  />
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog - lazy loaded */}
      {isEditDialogOpen && (
        <Suspense fallback={null}>
          <EditCandidateDialog
            candidate={candidate}
            open={isEditDialogOpen}
            onOpenChange={setIsEditDialogOpen}
          />
        </Suspense>
      )}

      {/* Archive/Restore Dialog - lazy loaded */}
      {isArchiveDialogOpen && (
        <Suspense fallback={null}>
          <ArchiveCandidateDialog
            candidate={candidate}
            open={isArchiveDialogOpen}
            onOpenChange={setIsArchiveDialogOpen}
          />
        </Suspense>
      )}
      {openTaskComments && (
        <TaskCommentsModal
          open={!!openTaskComments}
          taskId={openTaskComments.id}
          taskTitle={openTaskComments.title}
          candidateId={(candidate as any).id}
          onClose={() => setOpenTaskComments(null)}
        />
      )}
    </div>
  );
}

// Candidate Pipeline Duration Estimate Component
function CandidatePipelineEstimate({ candidateId, status }: { candidateId: string; status?: string }) {
  const { data: estimate, isLoading, error } = useQuery({
    queryKey: ['/api/candidates', candidateId, 'estimate', { businessDays: true }],
    queryFn: async () => {
      const params = new URLSearchParams({
        businessDays: 'true'
      });
      const response = await apiRequest('GET', `/api/candidates/${candidateId}/estimate?${params}`);
      return response.json();
    },
    enabled: !!candidateId
  });

  const formatDate = (dateStr?: string | null) => formatUtcDate(dateStr);

  if (isLoading) {
    return (
      <div className="mt-4 p-3 bg-muted/20 rounded-lg">
        <div className="text-sm text-muted-foreground">
          Calculating pipeline estimate...
        </div>
      </div>
    );
  }

  if (error || estimate?.error) {
    return (
      <div className="mt-4 p-3 bg-muted/20 rounded-lg">
        <div className="text-sm text-muted-foreground">
          Pipeline estimate unavailable
        </div>
      </div>
    );
  }

  // If candidate is canceled, show a canceled message instead of completion
  if (status === 'canceled') {
    return (
      <div className="mt-4 p-3 bg-orange-50 dark:bg-orange-950 rounded-lg border border-orange-200 dark:border-orange-800">
        <div className="text-sm font-medium text-orange-800 dark:text-orange-200">
          Candidate canceled — task estimates are not applicable.
        </div>
      </div>
    );
  }

  if (!estimate || estimate.remainingTasks === 0) {
    return (
      <div className="mt-4 p-3 bg-green-50 dark:bg-emerald-950 rounded-lg border border-green-200 dark:border-emerald-700">
        <div className="text-sm font-medium text-green-800 dark:text-emerald-300">
          🎉 All tasks completed!
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 p-0 bg-muted/20 rounded-lg">
      <h4 className="text-sm font-medium text-foreground mb-3 ml-7">Pipeline Duration Estimate</h4>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="flex items-start space-x-3">
          <CheckCircle className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-xs text-muted-foreground mb-1">Remaining Tasks</div>
            <div className="font-medium" data-testid="text-remaining-tasks">
              {estimate.remainingTasks} of {estimate.taskCount}
            </div>
          </div>
        </div>
        {estimate.totalBusinessDays !== null && (
          <div className="flex items-start space-x-3">
            <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-xs text-muted-foreground mb-1">Business Days</div>
              <div className="font-medium" data-testid="text-business-days">
                {estimate.totalBusinessDays}
              </div>
            </div>
          </div>
        )}
        {estimate.lastDueDate && (
          <div className="col-span-2 flex items-start space-x-3">
            <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
            <div>
              <div className="text-xs text-muted-foreground mb-1">Est. Completion</div>
              <div className="font-medium" data-testid="text-completion-date">
                {formatDate(estimate.lastDueDate)}
              </div>
            </div>
          </div>
        )}
      </div>
      {estimate.nonEstimable && estimate.nonEstimable.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="text-xs text-amber-700 dark:text-amber-400">
            {estimate.nonEstimable.length} task(s) without due dates not included
          </div>
        </div>
      )}
    </div>
  );
}
