/**
 * AddStageForm Component
 * 
 * Form for adding a new stage with tasks to a template.
 * Supports batch task selection and default due rule configuration.
 */
import { useState, useMemo } from "react";
import { UseMutationResult } from "@tanstack/react-query";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/shared/components/ui/toggle-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { AutoSelectCombobox } from "@/shared/components/inputs/AutoSelectCombobox";
import { useToast } from "@/shared/hooks/use-toast";
import type { 
  HiringStage, 
  TemplateStage, 
  TemplateTask, 
  TaskDefinition 
} from "@shared/schemas";

interface AddStageFormProps {
  templateId: string;
  hiringStages: HiringStage[];
  templateStages: TemplateStage[];
  templateTasks: TemplateTask[];
  taskDefinitions: TaskDefinition[];
  createStageWithTaskMutation: UseMutationResult<any, Error, any>;
  onClose: () => void;
}

export function AddStageForm({ 
  templateId, 
  hiringStages, 
  templateStages, 
  templateTasks,
  taskDefinitions,
  createStageWithTaskMutation, 
  onClose 
}: AddStageFormProps) {
  const { toast } = useToast();
  const [selectedStageId, setSelectedStageId] = useState("");
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [taskSearch, setTaskSearch] = useState("");
  const [dueRuleType, setDueRuleType] = useState("on_start_date");
  const [dueRuleValue, setDueRuleValue] = useState<number | string | null>(null);
  const [priorityId, setPriorityId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [assigneeUserId, setAssigneeUserId] = useState("");
  const [phase, setPhase] = useState<'pre_hire' | 'onboarding'>('pre_hire');

  const availableStages = hiringStages.filter(stage => 
    !templateStages.some(ts => ts.stageId === stage.id)
  );

  // Exclude task definitions that are already in ANY stage of the template
  const existingTaskDefIdsInStage = useMemo(() => {
    return new Set(
      templateTasks.map(t => t.taskDefId)
    );
  }, [templateTasks]);
  
  const availableTaskDefinitions = taskDefinitions.filter(
    td => !td.archived && !existingTaskDefIdsInStage.has(td.id)
  );
  const filteredTaskDefinitions = availableTaskDefinitions.filter(td =>
    td.name.toLowerCase().includes(taskSearch.trim().toLowerCase())
  );

  const handleTaskSelection = (taskId: string) => {
    setSelectedTaskIds(prev => 
      prev.includes(taskId) 
        ? prev.filter(id => id !== taskId)
        : [...prev, taskId]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStageId || selectedTaskIds.length === 0) return;

    // Validate fixed_date requires a date value
    if (dueRuleType === 'fixed_date' && (!dueRuleValue || (typeof dueRuleValue === 'string' && dueRuleValue.trim() === ''))) {
      toast({
        title: "Date required",
        description: "Please select a date when using Fixed Date.",
        variant: "destructive",
      });
      return;
    }

    // Race-condition guard: exclude tasks that have been added to this specific stage since dialog opened
    const existingStageIds = new Set(
      templateStages
        .filter(ts => ts.stageId === selectedStageId)
        .flatMap(ts => templateTasks.filter(t => t.templateStageId === ts.id).map(t => t.taskDefId))
    );
    const uniqueTaskIds = selectedTaskIds.filter(id => !existingStageIds.has(id));

    if (uniqueTaskIds.length === 0) {
      toast({
        title: "Nothing to add",
        description: "All selected tasks are already in this stage.",
        variant: "destructive",
      });
      return;
    }

    if (uniqueTaskIds.length !== selectedTaskIds.length) {
      const removed = selectedTaskIds.length - uniqueTaskIds.length;
      toast({
        title: "Some tasks skipped",
        description: `${removed} already-added task(s) in this stage were excluded.`,
      });
    }
    
    const resolvedDueRuleValue = (() => {
      if (dueRuleType === 'fixed_date') {
        return dueRuleValue;
      }
      if (dueRuleType === 'on_start_date' || dueRuleType === 'on_loo_date') {
        return null;
      }
      if (typeof dueRuleValue === 'number') {
        return dueRuleValue;
      }
      if (typeof dueRuleValue === 'string' && dueRuleValue.trim() !== '') {
        const parsed = parseInt(dueRuleValue, 10);
        return Number.isNaN(parsed) ? 0 : parsed;
      }
      return 0;
    })();

    createStageWithTaskMutation.mutate(
      { 
        stageId: selectedStageId, 
        taskDefIds: uniqueTaskIds,
        dueRuleType,
        dueRuleValue: resolvedDueRuleValue,
        priorityId: priorityId || null,
        categoryId: categoryId || null,
        defaultAssigneeKind: 'user' as const,
        defaultAssigneeUserId: assigneeUserId || undefined,
        defaultAssigneeRole: null,
        phase
      },
      { 
        onSuccess: () => {
          onClose();
          setSelectedStageId("");
          setSelectedTaskIds([]);
          setDueRuleType("on_start_date");
          setDueRuleValue(null);
          setPriorityId("");
          setCategoryId("");
          setAssigneeUserId("");
          setPhase('pre_hire');
        }
      }
    );
  };

  // Form is valid when: stage is selected, at least one new task is selected, and fixed_date has a date value
  const hasValidDueRuleValue = dueRuleType !== 'fixed_date' || (dueRuleValue && typeof dueRuleValue === 'string' && dueRuleValue.trim() !== '');
  const isFormValid = selectedStageId && selectedTaskIds.some(id => !existingTaskDefIdsInStage.has(id)) && hasValidDueRuleValue;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Stage Selection */}
      <div>
        <AutoSelectCombobox
          label="Select Stage to Add *"
          value={selectedStageId || ""}
          onChange={(id) => setSelectedStageId(id || "")}
          fetchItems={async (q: string) => {
            const ql = q.trim().toLowerCase()
            return availableStages
              .filter(s => s.name.toLowerCase().includes(ql))
              .map(s => ({ id: s.id, name: s.name }))
          }}
          placeholder="Search stages..."
          emptyText="No stages available."
          data-testid="select-add-stage"
        />
      </div>

      {/* Phase Selection */}
      <div className="space-y-2">
        <div>
          <label className="block text-sm font-medium text-muted-foreground">Phase</label>
          <p className="text-xs text-muted-foreground">Use pre-hire for tasks that depend on the offer letter, onboarding for day-one and later.</p>
        </div>
        <ToggleGroup
          type="single"
          value={phase}
          onValueChange={(value) => {
            if (value === "pre_hire" || value === "onboarding") {
              setPhase(value);
            }
          }}
          className="flex gap-2"
        >
          <ToggleGroupItem value="pre_hire" aria-label="Pre-hire phase" className="flex-1">
            Pre-hire
          </ToggleGroupItem>
          <ToggleGroupItem value="onboarding" aria-label="Onboarding phase" className="flex-1">
            Onboarding
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Task Selection - Only show if stage is selected */}
      {selectedStageId && (
        <div>
          <label className="block text-sm font-medium mb-2">
            Select Tasks to Add * (at least one required)
          </label>
          {/* Search input for tasks */}
          <div className="mb-2">
            <Input
              value={taskSearch}
              onChange={(e) => setTaskSearch(e.target.value)}
              placeholder="Search tasks..."
              aria-label="Search tasks to add"
              className="h-9"
              type="search"
            />
          </div>
          <div className="border rounded-md max-h-36 sm:max-h-48 overflow-y-auto p-2 space-y-2">
            {filteredTaskDefinitions.map((taskDef) => (
              <div key={taskDef.id} className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id={`task-${taskDef.id}`}
                  checked={selectedTaskIds.includes(taskDef.id)}
                  onChange={() => handleTaskSelection(taskDef.id)}
                  className="rounded border-gray-300"
                />
                <label htmlFor={`task-${taskDef.id}`} className="text-sm flex-1 cursor-pointer">
                  {taskDef.name}
                </label>
              </div>
            ))}
            {filteredTaskDefinitions.length === 0 && (
              <div className="text-sm text-muted-foreground px-1 py-1">
                {availableTaskDefinitions.length === 0
                  ? "All tasks are already in this template"
                  : "No tasks match your search."}
              </div>
            )}
          </div>
          {selectedTaskIds.length > 0 && (
            <p className="text-xs text-muted-foreground mt-1">
              {selectedTaskIds.length} task(s) selected
            </p>
          )}
        </div>
      )}

      {/* Due Rule Defaults - Only show if tasks are selected */}
      {selectedTaskIds.length > 0 && (
        <div className="border-t pt-4">
          <h4 className="text-sm font-medium mb-3">Default Due Date Settings (applied to all tasks)</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Due Rule Type</label>
              <Select
                value={dueRuleType}
                onValueChange={(value) => {
                  setDueRuleType(value);
                  if (value === 'fixed_date') {
                    setDueRuleValue('');
                  } else if (value === 'on_start_date' || value === 'on_loo_date' || value === 'on_loi_date') {
                    setDueRuleValue(null);
                  } else {
                    setDueRuleValue(0);
                  }
                }}
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Letter of Intent (LOI)</SelectLabel>
                    <SelectItem value="on_loi_date">On LOI Date</SelectItem>
                    <SelectItem value="days_before_loi">Days Before LOI</SelectItem>
                    <SelectItem value="days_after_loi">Days After LOI</SelectItem>
                  </SelectGroup>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>Offer letter (LOO) - Generic</SelectLabel>
                    <SelectItem value="on_loo_date">On LOO Date (Accepted or Issued)</SelectItem>
                    <SelectItem value="days_before_loo">Days Before LOO</SelectItem>
                    <SelectItem value="days_after_loo">Days After LOO</SelectItem>
                  </SelectGroup>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>Offer letter (LOO) - Accepted</SelectLabel>
                    <SelectItem value="on_loo_accepted_date">On LOO Accepted Date</SelectItem>
                    <SelectItem value="days_before_loo_accepted">Days Before LOO Accepted</SelectItem>
                    <SelectItem value="days_after_loo_accepted">Days After LOO Accepted</SelectItem>
                  </SelectGroup>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>Offer letter (LOO) - Issued</SelectLabel>
                    <SelectItem value="on_loo_issued_date">On LOO Issued Date</SelectItem>
                    <SelectItem value="days_before_loo_issued">Days Before LOO Issued</SelectItem>
                    <SelectItem value="days_after_loo_issued">Days After LOO Issued</SelectItem>
                  </SelectGroup>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>Start date</SelectLabel>
                    <SelectItem value="on_start_date">On Start Date</SelectItem>
                    <SelectItem value="days_before_start">Days Before Start</SelectItem>
                    <SelectItem value="days_after_start">Days After Start</SelectItem>
                  </SelectGroup>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>Stage relative</SelectLabel>
                    <SelectItem value="days_before_stage">Days Before Stage</SelectItem>
                    <SelectItem value="days_after_stage">Days After Stage</SelectItem>
                  </SelectGroup>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>Fixed</SelectLabel>
                    <SelectItem value="fixed_date">Fixed Date</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              <p className="mt-2 text-xs text-muted-foreground">
                LOI for prerequisite tasks; LOO anchors most pre-hire tasks; Start anchors day-one and beyond.
              </p>
            </div>
            {!['on_start_date', 'on_loo_date', 'on_loi_date', 'on_loo_accepted_date', 'on_loo_issued_date'].includes(dueRuleType) && (
              <div>
                <label className="block text-xs font-medium mb-1 text-foreground">
                  {dueRuleType === 'fixed_date' ? 'Date' : 'Days'}
                </label>
                {dueRuleType === 'fixed_date' ? (
                  <input
                    type="date"
                    value={dueRuleValue as string}
                    onChange={(e) => setDueRuleValue(e.target.value)}
                    className="w-full h-8 px-2 border rounded text-sm bg-background text-foreground border-input"
                  />
                ) : (
                  <input
                    type="number"
                    value={(dueRuleValue as number) ?? 0}
                    onChange={(e) => setDueRuleValue(parseInt(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full h-8 px-2 border rounded text-sm bg-background text-foreground border-input"
                  />
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-end space-x-2 pt-4">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button 
          type="submit" 
          disabled={!isFormValid || createStageWithTaskMutation.isPending}
          data-testid="button-add-stage-with-tasks"
        >
          {createStageWithTaskMutation.isPending ? "Adding..." : "Add Stage"}
        </Button>
      </div>
    </form>
  );
}
