import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Clock, FileText, Mail, UserCheck, Briefcase, Send, ThumbsUp, ThumbsDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
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
import { format } from "date-fns";
import {
  getHiringPhase,
  HIRING_PHASE_LABELS,
  HIRING_PHASE_VARIANTS,
  type HiringPhase,
} from "../utils/hiring-phase";
import { LooDateDialog } from "./loo-date-dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/shared/hooks/use-toast";

/**
 * Steps for the hiring progress stepper
 */
type HiringStepId = HiringPhase | "completed";

const HIRING_STEPS: { id: HiringStepId; label: string }[] = [
  { id: "loi_issued", label: HIRING_PHASE_LABELS.loi_issued },
  { id: "offer_pending", label: HIRING_PHASE_LABELS.offer_pending },
  { id: "pre_hire", label: HIRING_PHASE_LABELS.pre_hire },
  { id: "onboarding", label: HIRING_PHASE_LABELS.onboarding },
];

interface HiringProgressProps {
  candidate: {
    id: string;
    letterOfIntentDate: string | Date | null;
    offerLetterIssuedAt: string | Date | null;
    offerLetterAcceptedAt: string | Date | null;
    templateAppliedAt: string | Date | null;
  };
  /** The current stage phase from the candidate's workflow (pre_hire or onboarding) */
  currentStagePhase?: "pre_hire" | "onboarding" | null;
  /** When true, shows the candidate as fully onboarded (all tasks completed) */
  isFullyOnboarded?: boolean;
  className?: string;
}

interface StepIconProps {
  phase: HiringPhase;
  isComplete: boolean;
  isCurrent: boolean;
}

function StepIcon({ phase, isComplete, isCurrent }: StepIconProps) {
  const iconClass = cn(
    "h-5 w-5",
    isComplete && "text-white",
    isCurrent && "text-primary",
    !isComplete && !isCurrent && "text-muted-foreground"
  );

  if (isComplete) {
    return <Check className={iconClass} />;
  }

  switch (phase) {
    case "loi_issued":
      return <FileText className={iconClass} />;
    case "offer_pending":
      return <Mail className={iconClass} />;
    case "pre_hire":
      return <UserCheck className={iconClass} />;
    case "onboarding":
      return <Briefcase className={iconClass} />;
    default:
      return <Clock className={iconClass} />;
  }
}

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "MMM d, yyyy");
}

export function HiringProgress({
  candidate,
  currentStagePhase,
  isFullyOnboarded = false,
  className,
}: HiringProgressProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isLooDialogOpen, setIsLooDialogOpen] = useState(false);
  const [looDialogType, setLooDialogType] = useState<"issued" | "accepted">("issued");
  const [isDeclineDialogOpen, setIsDeclineDialogOpen] = useState(false);

  // Mutation for declining the offer
  const declineMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("PATCH", `/api/candidates/${candidate.id}`, {
        status: "offer_declined",
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Offer Declined",
        description: "The candidate's offer has been marked as declined.",
      });
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidate.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
      setIsDeclineDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to decline offer",
        variant: "destructive",
      });
    },
  });

  const phaseInfo = getHiringPhase(candidate);
  
  // Override the phase if currentStagePhase indicates onboarding and template is applied
  const effectivePhase: HiringPhase = 
    candidate.templateAppliedAt && currentStagePhase === "onboarding" 
      ? "onboarding" 
      : phaseInfo.phase;
  
  // When fully onboarded, all steps are complete
  const effectivePhaseIndex = isFullyOnboarded
    ? HIRING_STEPS.length // All steps complete
    : HIRING_STEPS.findIndex((step) => step.id === effectivePhase);

  // Determine step status for each phase
  const getStepStatus = (stepIndex: number) => {
    if (isFullyOnboarded) return "complete"; // All steps complete when fully onboarded
    if (stepIndex < effectivePhaseIndex) return "complete";
    if (stepIndex === effectivePhaseIndex) return "current";
    return "upcoming";
  };

  // Map each step to the corresponding candidate date value
  const getStepDate = (stepId: HiringPhase): string | null => {
    const stepDateMap: Record<HiringPhase, string | Date | null> = {
      loi_issued: candidate.letterOfIntentDate,
      offer_pending: candidate.offerLetterIssuedAt,
      pre_hire: candidate.offerLetterAcceptedAt,
      onboarding: candidate.templateAppliedAt,
    };

    const date = stepDateMap[stepId];
    return date ? formatDate(date) : null;
  };

  // Determine if the primary action button should be shown and what it should do
  const getPrimaryAction = () => {
    // If LOO has not been issued, show "Send LOO" button
    if (!candidate.offerLetterIssuedAt) {
      return {
        label: "Send LOO",
        icon: Send,
        onClick: () => {
          setLooDialogType("issued");
          setIsLooDialogOpen(true);
        },
      };
    }
    // If LOO is issued but not accepted, show "LOO Accepted" button
    if (!candidate.offerLetterAcceptedAt) {
      return {
        label: "LOO Accepted",
        icon: ThumbsUp,
        onClick: () => {
          setLooDialogType("accepted");
          setIsLooDialogOpen(true);
        },
      };
    }
    // Both dates are set, no action needed
    return null;
  };

  const primaryAction = getPrimaryAction();

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium">Hiring Progress</CardTitle>
          {isFullyOnboarded ? (
            <Badge variant="default" className="bg-green-600 hover:bg-green-600">Fully Onboarded</Badge>
          ) : (
            <Badge variant={HIRING_PHASE_VARIANTS[effectivePhase]}>{HIRING_PHASE_LABELS[effectivePhase]}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Progress Steps */}
        <div className="relative">
          {/* Connecting Line (background) */}
          <div className={cn(
            "absolute left-[18px] top-[24px] w-0.5 bg-muted",
            isFullyOnboarded ? "h-[calc(100%-24px)]" : "h-[calc(100%-48px)]"
          )} />
          
          {/* Progress Line (filled portion) */}
          <div
            className={cn(
              "absolute left-[18px] top-[24px] w-0.5 transition-all duration-500",
              isFullyOnboarded ? "bg-green-600" : "bg-primary"
            )}
            style={{
              height: isFullyOnboarded 
                ? "calc(100% - 40px)" // Full line to completion note when fully onboarded
                : `calc(${(effectivePhaseIndex / (HIRING_STEPS.length - 1)) * 100}% - ${effectivePhaseIndex === 0 ? 0 : 30}px)`,
            }}
          />

          {/* Steps */}
          <div className="relative space-y-6">
            {HIRING_STEPS.map((step, index) => {
              const status = getStepStatus(index);
              // Cast to HiringPhase since HIRING_STEPS only contains valid phases (not "completed")
              const stepDate = getStepDate(step.id as HiringPhase);
              const isOnboardingStep = step.id === "onboarding";

              return (
                <div key={step.id} className="flex gap-4">
                  {/* Step Circle */}
                  <div
                    className={cn(
                      "relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                      status === "complete" && "border-primary bg-primary",
                      status === "current" && "border-primary bg-background",
                      status === "upcoming" && "border-muted bg-background"
                    )}
                  >
                    <StepIcon
                      phase={step.id as HiringPhase}
                      isComplete={status === "complete"}
                      isCurrent={status === "current"}
                    />
                  </div>

                  {/* Step Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between min-h-9">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "font-medium",
                            status === "complete" && "text-foreground",
                            status === "current" && "text-primary",
                            status === "upcoming" && "text-muted-foreground"
                          )}
                        >
                          {/* Show "Offer Accepted" instead of "Offer Pending" once LOO is accepted */}
                          {step.id === "offer_pending" && candidate.offerLetterAcceptedAt
                            ? "Offer Accepted"
                            : step.label}
                        </span>
                        {status === "current" && (
                          <Badge variant="outline" className="text-xs">
                            Current
                          </Badge>
                        )}
                      </div>
                      
                      {/* Action buttons on the Onboarding row */}
                      {isOnboardingStep && primaryAction && (
                        <div className="flex gap-2">
                          {/* Show LOO Declined button when LOO is issued but not accepted */}
                          {candidate.offerLetterIssuedAt && !candidate.offerLetterAcceptedAt && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setIsDeclineDialogOpen(true)}
                              className="gap-1.5 border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              data-testid="button-hiring-progress-loo-declined"
                            >
                              <ThumbsDown className="h-3.5 w-3.5" />
                              LOO Declined
                            </Button>
                          )}
                          <Button
                            size="sm"
                            onClick={primaryAction.onClick}
                            className="gap-1.5"
                            data-testid={`button-hiring-progress-${candidate.offerLetterIssuedAt ? 'loo-accepted' : 'send-loo'}`}
                          >
                            <primaryAction.icon className="h-3.5 w-3.5" />
                            {primaryAction.label}
                          </Button>
                        </div>
                      )}
                    </div>
                    
                    {stepDate && (
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {stepDate}
                      </p>
                    )}

                    {isOnboardingStep && status === "upcoming" && !candidate.templateAppliedAt && (
                      <p className="mt-0.5 text-xs text-muted-foreground italic">
                        Template will be applied when offer is accepted
                      </p>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Template Status Note - positioned inside the progress line container when fully onboarded */}
            {candidate.templateAppliedAt && isFullyOnboarded && (
              <div className="flex gap-4">
                {/* Completion Circle */}
                <div className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-green-600 bg-green-600">
                  <Check className="h-5 w-5 text-white" />
                </div>
                {/* Content */}
                <div className="flex-1 min-w-0 max-w-[200px]">
                  <div className={cn(
                    "rounded-md p-3",
                    "bg-green-50 dark:bg-emerald-950 border border-green-200 dark:border-emerald-700"
                  )}>
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium text-green-700 dark:text-emerald-300">
                        Onboarding Complete!
                      </span>
                      {" · "}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Template Status Note - shown outside progress line when not fully onboarded */}
        {candidate.templateAppliedAt && !isFullyOnboarded && (
          <div className="mt-4 rounded-md bg-muted/50 p-3">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                Onboarding Active
              </span>
              {" · "}
              Template applied on {formatDate(candidate.templateAppliedAt)}
            </p>
          </div>
        )}

        {/* LOO Date Dialog */}
        <LooDateDialog
          candidateId={candidate.id}
          type={looDialogType}
          letterOfIntentDate={candidate.letterOfIntentDate}
          offerLetterIssuedAt={candidate.offerLetterIssuedAt}
          open={isLooDialogOpen}
          onOpenChange={setIsLooDialogOpen}
        />

        {/* LOO Declined Confirmation Dialog */}
        <AlertDialog open={isDeclineDialogOpen} onOpenChange={setIsDeclineDialogOpen}>
          <AlertDialogContent data-testid="dialog-loo-declined">
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm Offer Declined</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to mark this offer as declined? This will change the candidate's status to "Offer Declined" and stop any further hiring progress.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-decline">Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => declineMutation.mutate()}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                data-testid="button-confirm-decline"
              >
                {declineMutation.isPending ? "Declining..." : "Confirm Decline"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

/**
 * Compact version of the hiring progress for use in lists or smaller spaces
 */
export function HiringProgressBadge({
  candidate,
}: Pick<HiringProgressProps, "candidate">) {
  const phaseInfo = getHiringPhase(candidate);
  
  return (
    <Badge variant={HIRING_PHASE_VARIANTS[phaseInfo.phase]} className="gap-1">
      {phaseInfo.phase === "loi_issued" && <FileText className="h-3 w-3" />}
      {phaseInfo.phase === "offer_pending" && <Mail className="h-3 w-3" />}
      {phaseInfo.phase === "pre_hire" && <UserCheck className="h-3 w-3" />}
      {phaseInfo.phase === "onboarding" && <Briefcase className="h-3 w-3" />}
      {phaseInfo.label}
    </Badge>
  );
}
