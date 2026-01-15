/**
 * EditableStatusBadge Component
 * Purpose: Dropdown badge for changing candidate status with confirmation dialogs for destructive actions.
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/shared/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import { ChevronDown } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { invalidateMyTasks } from "@/lib/query-invalidate";
import { useToast } from "@/shared/hooks/use-toast";
import { 
  candidateStatusBadgeClass, 
  type ResolvedCandidateStatus 
} from "@/features/candidates/utils/status";

interface EditableStatusBadgeProps {
  candidate: any;
  user: any;
  tasks: any[];
  onStatusChange: () => void;
  resolvedStatus: ResolvedCandidateStatus;
  onRequestRestore: () => void;
  fullyOnboarded: boolean;
}

const STATUS_TRANSITIONS: Record<string, { value: string; label: string; destructive?: boolean }[]> = {
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

export function EditableStatusBadge({ 
  candidate, 
  user, 
  tasks,
  onStatusChange,
  resolvedStatus,
  onRequestRestore,
  fullyOnboarded
}: EditableStatusBadgeProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string>('');

  const updateStatusMutation = useMutation({
    mutationFn: async ({ status, closeOpenTasks }: { status: string; closeOpenTasks?: boolean }) => {
      const response = await apiRequest('PATCH', `/api/candidates/${candidate.id}/status`, { status, closeOpenTasks });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['candidate', candidate.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/candidates'] });
      queryClient.invalidateQueries({ queryKey: ['candidateTasks', candidate.id] });
      invalidateMyTasks(queryClient);

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
    return STATUS_TRANSITIONS[currentStatus] || [];
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
}
