/**
 * PipelineEstimateSection Component
 * 
 * Displays pipeline duration estimates for a template, including lead times,
 * suggested dates, and per-stage/phase breakdowns.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Calendar } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { DatePicker, formatDateForApi, parseAsLocalDate } from "@/shared/components/inputs/DatePicker";
import { PerStageMiniBar } from "./PerStageMiniBar";
import type { TemplateTask } from "@shared/schemas";

interface PipelineEstimateSectionProps {
  templateId: string;
  templateTasks: TemplateTask[];
  getTaskDefinitionName: (taskDefId: string) => string;
}

function formatPhaseLabel(phase?: string | null) {
  if (phase === 'onboarding') return 'Onboarding';
  return 'Pre-hire';
}

function formatNonEstimableReason(item: any) {
  switch (item.reason) {
    case 'missing_anchor':
      if (item.missingAnchor === 'loi') {
        return 'Waiting for LOI date';
      }
      if (item.missingAnchor === 'loo') {
        return 'Waiting for LOO date';
      }
      if (item.missingAnchor === 'loo_accepted') {
        return 'Waiting for LOO acceptance';
      }
      if (item.missingAnchor === 'loo_issued') {
        return 'Waiting for LOO to be issued';
      }
      if (item.missingAnchor === 'start') {
        return 'Waiting for anticipated start date';
      }
      return 'Waiting for anchor date';
    case 'stage_relative':
      return 'Stage-relative rule';
    case 'no_due_date':
      return 'No due date available';
    default:
      return item.reason;
  }
}

export function PipelineEstimateSection({ 
  templateId, 
  templateTasks, 
  getTaskDefinitionName 
}: PipelineEstimateSectionProps) {
  const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [looDate, setLooDate] = useState<string>("");
  const [loiDate, setLoiDate] = useState<string>("");

  const { data: estimate, isLoading, error } = useQuery({
    queryKey: ['/api/templates', templateId, 'estimate', { startDate, looDate, loiDate, businessDays: true }, templateTasks, getTaskDefinitionName],
    queryFn: async () => {
      const params = new URLSearchParams({
        businessDays: 'true'
      });
      if (startDate) {
        params.set('startDate', startDate);
      }
      if (looDate) {
        params.set('looDate', looDate);
      }
      if (loiDate) {
        params.set('loiDate', loiDate);
      }
      const response = await apiRequest('GET', `/api/templates/${templateId}/estimate?${params}`);
      return response.json();
    },
    enabled: !!templateId
  });

  const missingAnchorTasks = estimate?.nonEstimable?.filter((item: any) => item.reason === 'missing_anchor') ?? [];
  const otherNonEstimableTasks = estimate?.nonEstimable?.filter((item: any) => item.reason !== 'missing_anchor') ?? [];

  const formatDate = (dateStr: string) => {
    const date = parseAsLocalDate(dateStr);
    if (!date) return 'Invalid date';
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <Card className="mb-6 overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
          <Calendar className="w-5 h-5 shrink-0" />
          Pipeline Duration Estimate
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 min-w-0">
        {/* Configuration */}
        <div className="flex flex-col sm:flex-row gap-4 pb-4 border-b">
          <div className="flex-1">
            <label className="text-sm font-medium text-muted-foreground mb-1 block">
              LOI Date (override)
            </label>
            <DatePicker
              value={loiDate}
              onChange={(date) => setLoiDate(formatDateForApi(date) || '')}
              placeholder="Select LOI date"
              testId="input-estimate-loi-date"
              className="w-full sm:w-auto"
              showClear
              onClear={() => setLoiDate('')}
            />
          </div>
          <div className="flex-1">
            <label className="text-sm font-medium text-muted-foreground mb-1 block">
              LOO Accepted (override)
            </label>
            <DatePicker
              value={looDate}
              onChange={(date) => setLooDate(formatDateForApi(date) || '')}
              placeholder="Select LOO date"
              testId="input-estimate-loo-date"
              className="w-full sm:w-auto"
              showClear
              onClear={() => setLooDate('')}
            />
          </div>
          <div className="flex-1">
            <label className="text-sm font-medium text-muted-foreground mb-1 block">
              Anticipated Start (override)
            </label>
            <DatePicker
              value={startDate}
              onChange={(date) => setStartDate(formatDateForApi(date) || '')}
              placeholder="Select start date"
              testId="input-estimate-anticipated-start"
              className="w-full sm:w-auto"
              showClear
              onClear={() => setStartDate('')}
            />
          </div>
        </div>

        {/* Results */}
        {isLoading && (
          <div className="text-center py-4 text-muted-foreground">
            Calculating estimate...
          </div>
        )}

        {error && (
          <div className="text-center py-4 text-red-600">
            Error calculating estimate. Please try again.
          </div>
        )}

        {estimate && (
          <div className="space-y-4">
            {/* Lead Times Section */}
            {estimate.leadTimes && (estimate.leadTimes.loi > 0 || estimate.leadTimes.loo > 0 || estimate.leadTimes.looIssued > 0 || estimate.leadTimes.looAccepted > 0 || estimate.leadTimes.start > 0) && (
              <div>
                <h4 className="font-medium mb-3 text-foreground">Required Lead Times</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {estimate.leadTimes.loi > 0 && (
                    <div className="p-3 rounded border bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
                      <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                        {estimate.leadTimes.loi}
                      </div>
                      <div className="text-xs text-blue-600/70 dark:text-blue-400/70">days before LOI</div>
                    </div>
                  )}
                  {estimate.leadTimes.loo > 0 && (
                    <div className="p-3 rounded border bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800">
                      <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                        {estimate.leadTimes.loo}
                      </div>
                      <div className="text-xs text-purple-600/70 dark:text-purple-400/70">days before LOO</div>
                    </div>
                  )}
                  {estimate.leadTimes.looIssued > 0 && (
                    <div className="p-3 rounded border bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800">
                      <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                        {estimate.leadTimes.looIssued}
                      </div>
                      <div className="text-xs text-indigo-600/70 dark:text-indigo-400/70">days before LOO issued</div>
                    </div>
                  )}
                  {estimate.leadTimes.looAccepted > 0 && (
                    <div className="p-3 rounded border bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800">
                      <div className="text-2xl font-bold text-violet-600 dark:text-violet-400">
                        {estimate.leadTimes.looAccepted}
                      </div>
                      <div className="text-xs text-violet-600/70 dark:text-violet-400/70">days before LOO accepted</div>
                    </div>
                  )}
                  {estimate.leadTimes.start > 0 && (
                    <div className="p-3 rounded border bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800">
                      <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                        {estimate.leadTimes.start}
                      </div>
                      <div className="text-xs text-green-600/70 dark:text-green-400/70">days before start</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Suggested Dates based on Start Date */}
            {startDate && estimate.leadTimes && (estimate.leadTimes.start > 0 || estimate.leadTimes.loo > 0 || estimate.leadTimes.loi > 0) && (
              <div>
                <h4 className="font-medium mb-3 text-foreground">Suggested Anchor Dates</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {estimate.leadTimes.loi > 0 && (
                    <div className="p-3 rounded border bg-muted/40">
                      <div className="text-xs text-muted-foreground mb-1">Suggested LOI Date</div>
                      <div className="text-sm font-medium text-foreground mb-2">
                        {(() => {
                          const startDateObj = new Date(startDate);
                          const totalDaysBefore = estimate.leadTimes.start + estimate.leadTimes.loo + estimate.leadTimes.loi;
                          const suggestedDate = new Date(startDateObj);
                          suggestedDate.setDate(suggestedDate.getDate() - totalDaysBefore);
                          return formatDate(suggestedDate.toISOString());
                        })()}
                      </div>
                      {!loiDate && (
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="w-full text-xs"
                          onClick={() => {
                            const startDateObj = new Date(startDate);
                            const totalDaysBefore = estimate.leadTimes.start + estimate.leadTimes.loo + estimate.leadTimes.loi;
                            const suggestedDate = new Date(startDateObj);
                            suggestedDate.setDate(suggestedDate.getDate() - totalDaysBefore);
                            setLoiDate(suggestedDate.toISOString().split('T')[0]);
                          }}
                        >
                          Apply
                        </Button>
                      )}
                    </div>
                  )}
                  {estimate.leadTimes.loo > 0 && (
                    <div className="p-3 rounded border bg-muted/40">
                      <div className="text-xs text-muted-foreground mb-1">Suggested LOO Date</div>
                      <div className="text-sm font-medium text-foreground mb-2">
                        {(() => {
                          const startDateObj = new Date(startDate);
                          const totalDaysBefore = estimate.leadTimes.start + estimate.leadTimes.loo;
                          const suggestedDate = new Date(startDateObj);
                          suggestedDate.setDate(suggestedDate.getDate() - totalDaysBefore);
                          return formatDate(suggestedDate.toISOString());
                        })()}
                      </div>
                      {!looDate && (
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="w-full text-xs"
                          onClick={() => {
                            const startDateObj = new Date(startDate);
                            const totalDaysBefore = estimate.leadTimes.start + estimate.leadTimes.loo;
                            const suggestedDate = new Date(startDateObj);
                            suggestedDate.setDate(suggestedDate.getDate() - totalDaysBefore);
                            setLooDate(suggestedDate.toISOString().split('T')[0]);
                          }}
                        >
                          Apply
                        </Button>
                      )}
                    </div>
                  )}
                  {estimate.leadTimes.start > 0 && (
                    <div className="p-3 rounded border bg-muted/40">
                      <div className="text-xs text-muted-foreground mb-1">Pipeline Start Date</div>
                      <div className="text-sm font-medium text-foreground">
                        {(() => {
                          const startDateObj = new Date(startDate);
                          const suggestedDate = new Date(startDateObj);
                          suggestedDate.setDate(suggestedDate.getDate() - estimate.leadTimes.start);
                          return formatDate(suggestedDate.toISOString());
                        })()}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        ({estimate.leadTimes.start} days before start)
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Anchor summary */}
            {estimate.anchors && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded border bg-muted/40">
                  <div className="text-xs text-muted-foreground">LOI anchor</div>
                  <div className="text-sm font-medium text-foreground">
                    {estimate.anchors.loi ? formatDate(estimate.anchors.loi) : 'Not provided'}
                  </div>
                </div>
                <div className="p-3 rounded border bg-muted/40">
                  <div className="text-xs text-muted-foreground">LOO anchor</div>
                  <div className="text-sm font-medium text-foreground">
                    {estimate.anchors.loo ? formatDate(estimate.anchors.loo) : 'Not provided'}
                  </div>
                </div>
                <div className="p-3 rounded border bg-muted/40">
                  <div className="text-xs text-muted-foreground">Anticipated start</div>
                  <div className="text-sm font-medium text-foreground">
                    {estimate.anchors.start ? formatDate(estimate.anchors.start) : 'Not provided'}
                  </div>
                </div>
              </div>
            )}

            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-2xl font-bold text-foreground">
                  {estimate.taskCount}
                </div>
                <div className="text-sm text-muted-foreground">Total Tasks</div>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-2xl font-bold text-foreground">
                  {estimate.totalCalendarDays}
                </div>
                <div className="text-sm text-muted-foreground">Calendar Days</div>
              </div>
              {estimate.totalBusinessDays !== null && (
                <div className="text-center p-3 bg-muted/50 rounded-lg">
                  <div className="text-2xl font-bold text-foreground">
                    {estimate.totalBusinessDays}
                  </div>
                  <div className="text-sm text-muted-foreground">Business Days</div>
                </div>
              )}
              {estimate.lastDueDate && (
                <div className="text-center p-3 bg-muted/50 rounded-lg">
                  <div className="text-2xl font-bold text-foreground">
                    {formatDate(estimate.lastDueDate)}
                  </div>
                  <div className="text-sm text-muted-foreground">Est. Completion</div>
                </div>
              )}
            </div>

            {/* Per-stage duration mini bars */}
            {estimate.perStage && estimate.perStage.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Per-stage latest offsets</h4>
                <PerStageMiniBar stages={estimate.perStage} />
              </div>
            )}

            {/* Phase summaries */}
            {estimate.perPhase && estimate.perPhase.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Phase checkpoints</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[...estimate.perPhase]
                    .sort((a: any, b: any) => {
                      const phaseOrder: Record<string, number> = { pre_hire: 0, onboarding: 1 };
                      return (phaseOrder[a.phase] ?? 99) - (phaseOrder[b.phase] ?? 99);
                    })
                    .map((phase: any) => (
                    <div key={phase.phase} className="p-3 bg-muted/40 rounded-lg border border-muted/60">
                      <div className="text-sm text-muted-foreground">
                        {formatPhaseLabel(phase.phase)}
                      </div>
                      <div className="text-xl font-semibold text-foreground">
                        {phase.taskCount} task{phase.taskCount === 1 ? '' : 's'}
                      </div>
                      {phase.lastDueDate && (
                        <div className="text-xs text-muted-foreground mt-1">
                          Last due {formatDate(phase.lastDueDate)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {missingAnchorTasks.length > 0 && (
              <div className="border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-900/30 rounded-lg p-3 overflow-hidden">
                <h4 className="font-medium text-amber-700 dark:text-amber-400 mb-2">
                  Tasks waiting on anchors
                </h4>
                <div className="text-sm text-amber-900 dark:text-amber-100 space-y-1">
                  {missingAnchorTasks.map((item: any, index: number) => {
                    const templateTask = templateTasks.find(tt => tt.id === item.taskId);
                    const fallbackName = item.taskId ? `Task ${String(item.taskId).slice(0, 8)}...` : `Task ${index + 1}`;
                    const taskName = templateTask ? getTaskDefinitionName(templateTask.taskDefId) : fallbackName;
                    const anchorLabel = item.missingAnchor === 'loo' ? 'LOO anchor' : item.missingAnchor === 'start' ? 'Start anchor' : 'Anchor';
                    return (
                      <div key={item.taskId ?? index} className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-1 min-w-0">
                        <span className="min-w-0 break-words">
                          {taskName}
                          {item.stageName ? (
                            <span className="ml-1 text-xs text-muted-foreground">({item.stageName})</span>
                          ) : null}
                        </span>
                        <span className="text-xs font-medium uppercase tracking-wide text-amber-600 dark:text-amber-300 shrink-0">{anchorLabel}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Non-Estimable Tasks */}
            {otherNonEstimableTasks.length > 0 && (
              <div className="overflow-hidden">
                <h4 className="font-medium mb-2 text-amber-700 dark:text-amber-400">
                  Tasks Not Included in Estimate
                </h4>
                <div className="text-sm text-muted-foreground space-y-1">
                  {otherNonEstimableTasks.map((item: any, index: number) => {
                    const templateTask = templateTasks.find(tt => tt.id === item.taskId);
                    const fallbackName = item.taskId ? `Task ${String(item.taskId).slice(0, 8)}...` : `Task ${index + 1}`;
                    const taskName = templateTask ? getTaskDefinitionName(templateTask.taskDefId) : fallbackName;
                    const reasonText = formatNonEstimableReason(item);
                    return (
                      <div key={item.taskId ?? index} className="flex flex-col xs:flex-row xs:justify-between gap-1 min-w-0">
                        <span className="min-w-0 break-words">
                          {taskName}
                          {item.stageName ? (
                            <span className="ml-1 text-xs text-muted-foreground">({item.stageName})</span>
                          ) : null}
                        </span>
                        <span className="italic text-right shrink-0">{reasonText}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Disclaimer */}
            <div className="text-xs text-muted-foreground italic border-t pt-2">
              * This estimate includes only tasks with fixed schedules (start date-relative and fixed dates). 
              Stage-relative tasks are excluded as they depend on dynamic stage advancement timing.
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
