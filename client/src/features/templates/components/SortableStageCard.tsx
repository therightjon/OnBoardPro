/**
 * SortableStageCard Component
 * 
 * Draggable and collapsible stage card containing nested tasks.
 * Acts as a droppable zone for tasks.
 */
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { GripVertical, ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/components/ui/collapsible";
import type { TemplateTask } from "@shared/schemas";
import type { TemplateStageWithTasks } from "./TemplateStagesWithTasks";
import { SortableTaskRow } from "./SortableTaskRow";

interface SortableStageCardProps {
  stage: TemplateStageWithTasks;
  tasks: TemplateTask[];
  isExpanded: boolean;
  onToggle: () => void;
  onAddTask: () => void;
  onRemove: () => void;
  getTaskDefinitionName: (taskDefId: string) => string;
  getPriorityName: (priorityId: string | null) => string | null;
  onEditTask: (task: TemplateTask) => void;
  onDeleteTask: (taskId: string) => void;
}

export function SortableStageCard({
  stage,
  tasks,
  isExpanded,
  onToggle,
  onAddTask,
  onRemove,
  getTaskDefinitionName,
  getPriorityName,
  onEditTask,
  onDeleteTask
}: SortableStageCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: stage.templateStageId });

  const { setNodeRef: setDroppableRef } = useDroppable({
    id: stage.templateStageId
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const phaseLabel = stage.phase === "onboarding" ? "Onboarding" : "Pre Hire";

  return (
    <div ref={setSortableRef} style={style} className="contain-content">
      <Collapsible open={isExpanded} onOpenChange={onToggle}>
        <div className="flex items-center gap-3 rounded-lg border p-3 bg-card hover:bg-accent/50 transition-colors">
          {/* Drag Handle */}
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing flex-shrink-0"
          >
            <GripVertical className="h-5 w-5 text-muted-foreground" />
          </div>

          {/* Order Index Badge */}
          <Badge variant="outline" className="flex-shrink-0 w-8 h-8 flex items-center justify-center">
            {stage.orderIndex + 1}
          </Badge>

          {/* Stage Info */}
          <CollapsibleTrigger className="flex items-center gap-2 flex-1 text-left">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            )}
            <div className="flex flex-col flex-1 min-w-0">
              <span className="font-medium truncate">{stage.stageName}</span>
              <span className="text-xs text-muted-foreground capitalize">{phaseLabel}</span>
            </div>
          </CollapsibleTrigger>

          {/* Task Count Badge */}
          <Badge variant="secondary" className="flex-shrink-0">
            {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
          </Badge>

          {/* Actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onAddTask();
              }}
              title="Add task to this stage"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              title="Remove stage"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>

        <CollapsibleContent>
          <div ref={setDroppableRef} className="mt-2 ml-8 mr-2 space-y-1 rounded-lg border bg-muted/20 p-3">
            {tasks.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground">
                <p className="mb-3">No tasks in this stage</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onAddTask}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Task
                </Button>
              </div>
            ) : (
              <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1">
                  {tasks.map((task) => (
                    <SortableTaskRow
                      key={task.id}
                      task={task}
                      getTaskDefinitionName={getTaskDefinitionName}
                      getPriorityName={getPriorityName}
                      onEdit={() => onEditTask(task)}
                      onDelete={() => onDeleteTask(task.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
