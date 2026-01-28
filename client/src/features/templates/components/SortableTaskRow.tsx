/**
 * SortableTaskRow Component
 * 
 * Draggable task row with task details and actions.
 * Can be dragged to reorder within stage or move to different stage.
 */
import { memo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Edit, Trash2 } from "lucide-react";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import type { TemplateTask } from "@shared/schemas";

interface SortableTaskRowProps {
  task: TemplateTask;
  getTaskDefinitionName: (taskDefId: string) => string;
  getPriorityName: (priorityId: string | null) => string | null;
  onEdit: () => void;
  onDelete: () => void;
}

function formatDueRule(task: TemplateTask): string {
  const { dueRuleType, dueRuleValue, fixedDate } = task;
  
  if (dueRuleType === "fixed_date" && fixedDate) {
    return `Fixed: ${new Date(fixedDate).toLocaleDateString()}`;
  }
  
  const ruleLabels: Record<string, string> = {
    on_loi_date: "LOI",
    days_before_loi: `LOI -${dueRuleValue}d`,
    days_after_loi: `LOI +${dueRuleValue}d`,
    on_loo_date: "LOO",
    days_before_loo: `LOO -${dueRuleValue}d`,
    days_after_loo: `LOO +${dueRuleValue}d`,
    on_loo_accepted_date: "LOO accepted",
    days_before_loo_accepted: `LOO accepted -${dueRuleValue}d`,
    days_after_loo_accepted: `LOO accepted +${dueRuleValue}d`,
    on_loo_issued_date: "LOO issued",
    days_before_loo_issued: `LOO issued -${dueRuleValue}d`,
    days_after_loo_issued: `LOO issued +${dueRuleValue}d`,
    on_start_date: "Start",
    days_before_start: `Start -${dueRuleValue}d`,
    days_after_start: `Start +${dueRuleValue}d`,
    days_before_stage: `Stage -${dueRuleValue}d`,
    days_after_stage: `Stage +${dueRuleValue}d`,
  };
  
  return ruleLabels[dueRuleType] || dueRuleType;
}

export const SortableTaskRow = memo(function SortableTaskRow({
  task,
  getTaskDefinitionName,
  getPriorityName,
  onEdit,
  onDelete
}: SortableTaskRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const taskName = getTaskDefinitionName(task.taskDefId);
  const priorityName = getPriorityName(task.defaultPriorityId);
  const dueRuleText = formatDueRule(task);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-1 sm:gap-2 rounded-md border bg-card p-2 hover:bg-accent/50 transition-colors min-w-0"
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing flex-shrink-0"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Task Name */}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium truncate block">{taskName}</span>
        {task.isPrerequisite && (
          <Badge variant="outline" className="mt-1 text-xs">
            Prerequisite
          </Badge>
        )}
      </div>

      {/* Due Rule - hidden on very small screens */}
      <div className="hidden xs:block text-xs text-muted-foreground flex-shrink-0">
        {dueRuleText}
      </div>

      {/* Priority - hidden on very small screens */}
      {priorityName && (
        <Badge variant="secondary" className="hidden sm:flex flex-shrink-0 text-xs">
          {priorityName}
        </Badge>
      )}

      {/* Actions */}
      <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={onEdit}
          title="Edit task"
          className="h-8 w-8 p-0 sm:h-auto sm:w-auto sm:p-2"
        >
          <Edit className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          title="Delete task"
          className="h-8 w-8 p-0 sm:h-auto sm:w-auto sm:p-2"
        >
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>
    </div>
  );
});
