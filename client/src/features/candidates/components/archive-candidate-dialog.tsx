import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/shared/components/ui/form";
import { Button } from "@/shared/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { Calendar } from "@/shared/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/shared/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { invalidateMyTasks } from "@/lib/query-invalidate";
import { canArchiveCandidate } from "@/features/candidates/utils/status";

interface ArchiveCandidateDialogProps {
  candidate: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onArchiveComplete?: () => void;
}

const resetCandidateSchema = z.object({
  offerLetterIssuedAt: z.date({
    required_error: "LOO issued date is required",
  }),
  offerLetterAcceptedAt: z.date().optional().nullable(),
  anticipatedStartDate: z.date({
    required_error: "Anticipated start date is required",
  }),
}).superRefine((data, ctx) => {
  if (data.offerLetterAcceptedAt && data.offerLetterAcceptedAt < data.offerLetterIssuedAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["offerLetterAcceptedAt"],
      message: "LOO accepted date cannot be before the issued date",
    });
  }

  if (data.anticipatedStartDate < data.offerLetterIssuedAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["anticipatedStartDate"],
      message: "Anticipated start date cannot be before the LOO issued date",
    });
  }

  if (data.offerLetterAcceptedAt && data.anticipatedStartDate < data.offerLetterAcceptedAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["anticipatedStartDate"],
      message: "Anticipated start date cannot be before the LOO accepted date",
    });
  }
});

type ResetCandidateForm = z.infer<typeof resetCandidateSchema>;
const formatApiDate = (date: Date) => format(date, "yyyy-MM-dd");

export function ArchiveCandidateDialog({ 
  candidate, 
  open, 
  onOpenChange, 
  onArchiveComplete 
}: ArchiveCandidateDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [suppressCancelToast, setSuppressCancelToast] = useState(false);

  const wasCanceledBeforeArchive = useMemo(() => {
    if (!candidate) return false;
    return candidate.statusBeforeArchive === 'canceled' || (candidate.archived && candidate.status === 'canceled');
  }, [candidate]);

  const resetForm = useForm<ResetCandidateForm>({
    resolver: zodResolver(resetCandidateSchema),
    defaultValues: {
      offerLetterIssuedAt: undefined,
      offerLetterAcceptedAt: undefined,
      anticipatedStartDate: undefined,
    },
  });

  useEffect(() => {
    if (open && wasCanceledBeforeArchive) {
      resetForm.reset({
        offerLetterIssuedAt: candidate?.offerLetterIssuedAt ? new Date(candidate.offerLetterIssuedAt) : undefined,
        offerLetterAcceptedAt: candidate?.offerLetterAcceptedAt ? new Date(candidate.offerLetterAcceptedAt) : undefined,
        anticipatedStartDate: candidate?.anticipatedStartDate ? new Date(candidate.anticipatedStartDate) : undefined,
      });
    }

    if (!open) {
      setSuppressCancelToast(false);
      resetForm.reset({
        offerLetterIssuedAt: undefined,
        offerLetterAcceptedAt: undefined,
        anticipatedStartDate: undefined,
      });
    }
  }, [open, wasCanceledBeforeArchive, candidate, resetForm]);

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
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidateToRestore.id, "tasks"] });
      invalidateMyTasks(queryClient);
      
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

  const resetRestoreMutation = useMutation({
    mutationFn: async (values: ResetCandidateForm) => {
      if (!candidate) throw new Error("No candidate provided");
      const response = await apiRequest("POST", `/api/candidates/${candidate.id}/restore`, {
        reset: true,
        offerLetterIssuedAt: formatApiDate(values.offerLetterIssuedAt),
        offerLetterAcceptedAt: values.offerLetterAcceptedAt ? formatApiDate(values.offerLetterAcceptedAt) : null,
        anticipatedStartDate: formatApiDate(values.anticipatedStartDate),
      });
      return response.json();
    },
    onSuccess: () => {
      setSuppressCancelToast(true);
      toast({
        title: "Candidate restored and reset.",
        description: "Candidate restored and reset.",
      });
      
      if (candidate) {
        queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidate.id] });
        queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidate.id, "tasks"] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
      invalidateMyTasks(queryClient);

      onOpenChange(false);
      resetForm.reset({
        offerLetterIssuedAt: undefined,
        offerLetterAcceptedAt: undefined,
        anticipatedStartDate: undefined,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reset and restore candidate",
        variant: "destructive",
      });
    },
  });

  const handleResetCancel = () => {
    toast({
      title: "Restore canceled",
      description: "This candidate can’t be restored without resetting onboarding dates.",
      variant: "destructive",
    });
    onOpenChange(false);
  };

  const handleResetOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      if (suppressCancelToast) {
        setSuppressCancelToast(false);
        onOpenChange(false);
        return;
      }
      handleResetCancel();
      return;
    }
    onOpenChange(true);
  };

  const handleArchive = () => {
    if (!candidate) {
      console.error('No candidate provided for archive operation');
      return;
    }
    // Defensive check: prevent archiving canceled candidates
    if (!canArchiveCandidate(candidate)) {
      toast({
        title: "Cannot archive candidate",
        description: "This candidate is in canceled status and cannot be archived. Canceled candidates are already in a terminal state.",
        variant: "destructive",
      });
      onOpenChange(false);
      return;
    }
    archiveMutation.mutate(candidate);
  };

  const handleRestore = () => {
    if (!candidate) {
      console.error('No candidate provided for restore operation');
      return;
    }
    if (wasCanceledBeforeArchive) {
      onOpenChange(true);
      return;
    }
    restoreMutation.mutate(candidate);
  };

  // Don't render if no candidate is provided
  if (!candidate) {
    return null;
  }

  if (candidate.archived) {
    if (wasCanceledBeforeArchive) {
      return (
        <Dialog open={open} onOpenChange={handleResetOpenChange}>
          <DialogContent data-testid="dialog-restore-candidate">
            <DialogHeader>
              <DialogTitle>Reset Candidate for Reactivation</DialogTitle>
              <DialogDescription>
                This candidate was previously canceled and cannot be restored without updated onboarding dates. Do you want to reset and reactivate this candidate?
              </DialogDescription>
            </DialogHeader>

            <Form {...resetForm}>
              <form
                className="space-y-4"
                onSubmit={resetForm.handleSubmit((values) => resetRestoreMutation.mutate(values))}
              >
                <div className="grid grid-cols-1 gap-4">
                  <FormField
                    control={resetForm.control}
                    name="offerLetterIssuedAt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>LOO Issued Date *</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full justify-between text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                              type="button"
                            >
                              {field.value ? format(field.value, "LLL dd, yyyy") : "Select date"}
                              <CalendarIcon className="h-4 w-4 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={(date) => field.onChange(date ?? undefined)}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={resetForm.control}
                    name="offerLetterAcceptedAt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>LOO Accepted Date (optional)</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full justify-between text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                              type="button"
                            >
                              {field.value ? format(field.value, "LLL dd, yyyy") : "Select date"}
                              <CalendarIcon className="h-4 w-4 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value ?? undefined}
                              onSelect={(date) => field.onChange(date ?? undefined)}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={resetForm.control}
                    name="anticipatedStartDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Anticipated Start Date *</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full justify-between text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                              type="button"
                            >
                              {field.value ? format(field.value, "LLL dd, yyyy") : "Select date"}
                              <CalendarIcon className="h-4 w-4 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={(date) => field.onChange(date ?? undefined)}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleResetOpenChange(false)}
                    disabled={resetRestoreMutation.isPending}
                    data-testid="button-cancel-reset-restore"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={resetRestoreMutation.isPending}
                    data-testid="button-confirm-reset-restore"
                  >
                    {resetRestoreMutation.isPending ? "Resetting..." : "Reset & Restore"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      );
    }

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
