/**
 * CandidatePipelineEstimate Component
 * Purpose: Display remaining tasks and estimated pipeline completion for a candidate.
 */
import { useQuery } from "@tanstack/react-query";
import { Calendar, Clock, CheckCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface CandidatePipelineEstimateProps {
  candidateId: string;
  status?: string;
  templateAppliedAt?: string | null;
}

const dateOnlyIsoRegex = /^\d{4}-\d{2}-\d{2}$/;
const normalizeIso = (iso: string) => (dateOnlyIsoRegex.test(iso) ? `${iso}T00:00:00.000Z` : iso);
const readableDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const formatUtcDate = (iso?: string | null) => {
  if (!iso) return "Not set";
  const normalized = normalizeIso(iso);
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "Not set";
  return readableDateFormatter.format(date);
};

export function CandidatePipelineEstimate({ 
  candidateId, 
  status, 
  templateAppliedAt 
}: CandidatePipelineEstimateProps) {
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

  // Don't show "All tasks completed" if template hasn't been applied yet
  // This prevents showing completion when only prerequisite tasks exist
  if (!estimate || estimate.remainingTasks === 0) {
    if (!templateAppliedAt) {
      return (
        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="text-sm font-medium text-blue-800 dark:text-blue-200">
            Awaiting template expansion after Letter of Offer acceptance
          </div>
        </div>
      );
    }

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
                {formatUtcDate(estimate.lastDueDate)}
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
