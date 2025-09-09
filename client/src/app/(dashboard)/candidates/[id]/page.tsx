import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useMemo, useState } from "react";
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
import { EditCandidateDialog } from "@/features/candidates/components/edit-candidate-dialog";
import { ArchiveCandidateDialog } from "@/features/candidates/components/archive-candidate-dialog";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/shared/components/ui/alert-dialog";
import { useToast } from "@/shared/hooks/use-toast";

export default function CandidateDetailPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : Array.isArray(params?.id) ? params.id[0] : '';
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);

  const { data: candidate, isLoading: candidateLoading, error: candidateError } = useQuery({
    queryKey: ["/api/candidates", id],
    enabled: !!id && id !== 'undefined',
  });

  const { data: candidateTasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ["/api/candidates", id, "tasks"],
    enabled: !!id && id !== 'undefined',
  });

  const { data: candidateStages = [], isLoading: stagesLoading } = useQuery({
    queryKey: ["/api/candidates", id, "stages"],
    enabled: !!id && id !== 'undefined',
  });

  const { data: stageHistoryData, isLoading: historyLoading } = useQuery({
    queryKey: ["/api/candidates", id, "stage-history"],
    enabled: !!id && id !== 'undefined',
  });

  const stageHistory = (stageHistoryData as any)?.history || [];

  // Build order map from snapshotted stages
  const orderMap = useMemo(() => {
    const m = new Map<string, number>();
    (candidateStages as any[]).forEach((s: any) => m.set(s.stageId, s.orderIndex));
    return m;
  }, [candidateStages]);

  // Attach order for stable sorting and map field names from API
  const tasksWithOrder = useMemo(
    () => (candidateTasks as any[]).map((t: any) => ({
      ...t,
      // Map field names from new API structure
      stageId: t.stage_id,
      stageName: t.stage_name,
      stageOrderIndex: t.stage_order_index ?? orderMap.get(t.stage_id) ?? Number.MAX_SAFE_INTEGER,
      dueAt: t.dueAt,
      assigneeName: t.assignee_name,
      priorityName: t.priority_name,
      categoryName: t.category_name,
      updatedAt: t.updated_at
    })),
    [candidateTasks, orderMap]
  );

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

  const EditableStatusBadge = ({ candidate, user, tasks, onStatusChange }: { 
    candidate: any; 
    user: any; 
    tasks: any[];
    onStatusChange: () => void; 
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
        queryClient.invalidateQueries({ queryKey: ['/api/tasks/mine'] });
        queryClient.invalidateQueries({ queryKey: ['/api/tasks/dashboard'] });

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
        'archived': [
          { value: 'active', label: 'Restore to Active' }
        ]
      };
      return transitions[currentStatus] || [];
    };

    const handleStatusSelect = (newStatus: string) => {
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

    // Only show editable for authorized roles
    const canEdit = user?.role === 'system_admin' || user?.role === 'hr_staff';
    
    if (!canEdit) {
      return (
        <Badge className={getStatusColor(candidate.status || 'draft')} data-testid="badge-candidate-status">
          {(candidate.status || 'draft').replace('_', ' ').toUpperCase()}
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
              className={`${getStatusColor(candidate.status || 'draft')} inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium hover:opacity-80 transition-opacity`}
              data-testid="button-status-dropdown"
              disabled={updateStatusMutation.isPending}
            >
              {(candidate.status || 'draft').replace('_', ' ').toUpperCase()}
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-accent/10 text-accent";
      case "draft": return "bg-chart-3/10 text-chart-3";
      case "completed": return "bg-chart-5/10 text-chart-5";
      case "on_hold": return "bg-chart-4/10 text-chart-4";
      case "canceled": return "bg-destructive/10 text-destructive";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-3 xs:space-y-4 sm:space-y-6 max-w-none xs:max-w-[350px] sm:max-w-4xl lg:max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="flex flex-col xs:flex-row xs:items-center gap-2 xs:gap-4 min-w-0">
          <Link href="/candidates">
            <Button variant="ghost" size="sm" className="min-h-[44px] w-full xs:w-auto" data-testid="button-back">
              <ArrowLeft className="w-4 h-4 xs:mr-2" />
              <span className="hidden xs:inline">Back to </span>Candidates
            </Button>
          </Link>
          <div className="min-w-0">
            <h1 className="text-base xs:text-lg sm:text-xl lg:text-2xl font-bold text-foreground break-words" data-testid="text-candidate-name">
              {(candidate as any).salutation ? `${(candidate as any).salutation} ` : ''}{(candidate as any).firstName} {(candidate as any).lastName}
            </h1>
            <p className="text-xs xs:text-sm text-muted-foreground break-all">{(candidate as any).email}</p>
          </div>
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
          />
          {(candidate as any).archived && (
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
          <CardTitle className="flex items-center text-base xs:text-lg sm:text-xl">
            <User className="w-4 h-4 mr-2" />
            Candidate Information
          </CardTitle>
          {(() => {
            // Calculate if all tasks are completed
            const allTasks = Object.values(tasksByStage).flat() as any[];
            const hasAnyTasks = allTasks.length > 0;
            const allTasksCompleted = hasAnyTasks && allTasks.every((task: any) => task.status === 'done');
            
            return allTasksCompleted && (
              <div className="mt-4 p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-2xl font-bold text-green-700 dark:text-green-400 text-center" data-testid="text-onboarding-complete">
                  🎉 Onboarding Complete! 🎉
                </p>
              </div>
            );
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
                <div className="flex items-start space-x-3">
                  <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <dt className="text-xs xs:text-sm font-medium">Start Date</dt>
                    <dd className="text-xs xs:text-sm text-muted-foreground" data-testid="text-candidate-start-date">
                      {(candidate as any).startDate ? new Date((candidate as any).startDate).toLocaleDateString() : "Not set"}
                    </dd>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <Building className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <dt className="text-xs xs:text-sm font-medium">Candidate Type</dt>
                    <dd className="text-xs xs:text-sm text-muted-foreground">{(candidate as any).candidateType?.name || "Not set"}</dd>
                  </div>
                </div>

                {(candidate as any).facultyRank && (
                  <div className="flex items-start space-x-3">
                    <User className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <dt className="text-xs xs:text-sm font-medium">Faculty Rank</dt>
                      <dd className="text-xs xs:text-sm text-muted-foreground">{(candidate as any).facultyRank.name}</dd>
                    </div>
                  </div>
                )}
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
                  <div className="text-xs xs:text-sm text-muted-foreground break-words" data-testid="text-current-stage">
                    {(candidate as any).currentStage?.name || "Not set"}
                  </div>
                </div>
              </div>

              {/* Pipeline Duration Estimate */}
              {(candidate as any).templateAppliedFromId && <CandidatePipelineEstimate candidateId={(candidate as any).id} />}
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
                  <dd className="text-sm xs:text-base mt-1">{(candidate as any).templateAppliedAt ? new Date((candidate as any).templateAppliedAt).toLocaleDateString() : "N/A"}</dd>
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

      {/* Tasks and Timeline Tabs */}
      <Card>
        <CardContent className="p-3 xs:p-4 sm:p-6">
          <Tabs defaultValue="tasks" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="tasks" className="" data-testid="tab-tasks">Tasks</TabsTrigger>
              <TabsTrigger value="timeline" className="" data-testid="tab-timeline">Timeline</TabsTrigger>
            </TabsList>

            <TabsContent value="tasks" className="space-y-3 xs:space-y-4">
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
                                  <h4 className="text-sm xs:text-base font-medium break-words min-w-0">{task.title}</h4>
                                  <TaskStatusCell
                                    taskId={task.id}
                                    candidateId={(candidate as any).id}
                                    value={task.status}
                                  />
                                </div>
                                {task.description && (
                                  <p className="text-xs xs:text-sm text-muted-foreground mb-2 break-words">{task.description}</p>
                                )}
                                <div className="flex flex-col gap-2 text-xs xs:text-sm text-muted-foreground">
                                  <div className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-1 xs:gap-2">
                                    <div className="flex flex-col xs:flex-row xs:flex-wrap gap-1 xs:gap-x-4 xs:gap-y-1">
                                      <span>Priority: {task.priority?.toUpperCase()}</span>
                                      {task.assignee && (
                                        <span>
                                          Assignee: <span className="font-bold">{`${task.assignee.firstName} ${task.assignee.lastName}`}</span>
                                        </span>
                                      )}
                                    </div>
                                    <span className="xs:ml-auto">
                                      {task.dueAt ? `Due: ${new Date(task.dueAt).toLocaleDateString()}` : "No due date"}
                                    </span>
                                  </div>
                                </div>
                                {task.notes && (
                                  <div className="mt-2 pt-2 border-t">
                                    <p className="text-sm text-muted-foreground">
                                      <strong>Notes:</strong> {task.notes}
                                    </p>
                                  </div>
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

            <TabsContent value="timeline" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 flex-wrap">
                    <Clock className="w-4 h-4" />
                    <span>Stage Timeline</span>
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
                      // Tie-breaker: for same timestamp, show higher stage order first (e.g., Stage 3 before Stage 2)
                      const ao = a.stage?.orderIndex ?? 0;
                      const bo = b.stage?.orderIndex ?? 0;
                      return bo - ao;
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
                          {t.dueAt && <span className="ml-2">Due: {new Date(t.dueAt).toLocaleDateString()}</span>}
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

      {/* Edit Dialog */}
      <EditCandidateDialog
        candidate={candidate}
        open={isEditDialogOpen}
        onOpenChange={setIsEditDialogOpen}
      />

      {/* Archive/Restore Dialog */}
      <ArchiveCandidateDialog
        candidate={candidate}
        open={isArchiveDialogOpen}
        onOpenChange={setIsArchiveDialogOpen}
      />
    </div>
  );
}

// Candidate Pipeline Duration Estimate Component
function CandidatePipelineEstimate({ candidateId }: { candidateId: string }) {
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

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

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

  if (!estimate || estimate.remainingTasks === 0) {
    return (
      <div className="mt-4 p-3 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
        <div className="text-sm font-medium text-green-800 dark:text-green-200">
          🎉 All tasks completed!
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 p-0 bg-muted/20 rounded-lg">
      <h4 className="text-sm font-medium text-foreground mb-3 ml-7">Pipeline Duration Estimate</h4>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="flex items-center space-x-2">
          <CheckCircle className="w-4 h-4 text-muted-foreground" />
          <div>
            <div className="text-xs text-muted-foreground mb-1 ml-1">Remaining Tasks</div>
            <div className="font-medium ml-1" data-testid="text-remaining-tasks">
              {estimate.remainingTasks} of {estimate.taskCount}
            </div>
          </div>
        </div>
        {estimate.totalBusinessDays !== null && (
          <div className="flex items-center space-x-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <div>
              <div className="text-xs text-muted-foreground mb-1 ml-1">Business Days</div>
              <div className="font-medium ml-1" data-testid="text-business-days">
                {estimate.totalBusinessDays}
              </div>
            </div>
          </div>
        )}
        {estimate.lastDueDate && (
          <div className="col-span-2 flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <div>
              <div className="text-xs text-muted-foreground mb-1 ml-1">Est. Completion</div>
              <div className="font-medium ml-1" data-testid="text-completion-date">
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
