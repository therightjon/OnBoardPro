import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { useToast } from "@/shared/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface ArchiveCandidateDialogProps {
  candidate: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onArchiveComplete?: () => void;
}

export function ArchiveCandidateDialog({ 
  candidate, 
  open, 
  onOpenChange, 
  onArchiveComplete 
}: ArchiveCandidateDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const archiveMutation = useMutation({
    mutationFn: async (candidateToArchive: any) => {
      if (!candidateToArchive) throw new Error("No candidate provided");
      const response = await apiRequest("DELETE", `/api/candidates/${candidateToArchive.id}`);
      return response.json();
    },
    onSuccess: (_, candidateToArchive) => {
      if (!candidateToArchive) return;
      toast({
        title: "Candidate Archived",
        description: `${candidateToArchive.firstName} ${candidateToArchive.lastName} has been archived successfully.`,
      });
      
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateToArchive.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
      
      onOpenChange(false);
      onArchiveComplete?.();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to archive candidate",
        variant: "destructive",
      });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (candidateToRestore: any) => {
      if (!candidateToRestore) throw new Error("No candidate provided");
      const response = await apiRequest("POST", `/api/candidates/${candidateToRestore.id}/restore`);
      return response.json();
    },
    onSuccess: (_, candidateToRestore) => {
      if (!candidateToRestore) return;
      toast({
        title: "Candidate Restored",
        description: `${candidateToRestore.firstName} ${candidateToRestore.lastName} has been restored successfully.`,
      });
      
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateToRestore.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
      
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to restore candidate",
        variant: "destructive",
      });
    },
  });

  const handleArchive = () => {
    if (!candidate) {
      console.error('No candidate provided for archive operation');
      return;
    }
    archiveMutation.mutate(candidate);
  };

  const handleRestore = () => {
    if (!candidate) {
      console.error('No candidate provided for restore operation');
      return;
    }
    restoreMutation.mutate(candidate);
  };

  // Don't render if no candidate is provided
  if (!candidate) {
    return null;
  }

  if (candidate.archived) {
    return (
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent data-testid="dialog-restore-candidate">
          <AlertDialogHeader>
            <AlertDialogTitle>Restore Candidate</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to restore <strong>{candidate.firstName} {candidate.lastName}</strong>? 
              This will make the candidate active again and visible in the main candidates list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-restore">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleRestore}
              disabled={restoreMutation.isPending}
              data-testid="button-confirm-restore"
            >
              {restoreMutation.isPending ? "Restoring..." : "Restore"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent data-testid="dialog-archive-candidate">
        <AlertDialogHeader>
          <AlertDialogTitle>Archive Candidate</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to archive <strong>{candidate?.firstName} {candidate?.lastName}</strong>? 
            This will remove the candidate from the active candidates list. You can restore them later if needed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-cancel-archive">Cancel</AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleArchive}
            disabled={archiveMutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            data-testid="button-confirm-archive"
          >
            {archiveMutation.isPending ? "Archiving..." : "Archive"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}