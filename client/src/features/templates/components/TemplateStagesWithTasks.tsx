/**
 * TemplateStagesWithTasks Component
 * 
 * Unified hierarchical view of template stages with nested tasks.
 * Supports drag-and-drop for both stages and tasks, with collapsible stages.
 */
import { useState, useMemo } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type UniqueIdentifier
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { ChevronDown, ChevronUp, Plus, Loader2 } from "lucide-react";
import type { TemplateTask } from "@shared/schemas";
import { SortableStageCard } from "./SortableStageCard";
import { SortableTaskRow } from "./SortableTaskRow";

export interface TemplateStageWithTasks {
  templateStageId: string;
  stageId: string;
  stageName: string;
  orderIndex: number;
  phase: string | null;
}

interface TemplateStagesWithTasksProps {
  templateId: string;
  stages: TemplateStageWithTasks[];
  tasks: TemplateTask[];
  taskDefinitions: Array<{ id: string; name: string }>;
  priorities: Array<{ id: string; name: string }>;
  isLoading?: boolean;
  onStageReorder: (stageIdsInOrder: string[]) => Promise<void>;
  onTaskReorder: (taskId: string, targetStageId: string, targetTemplateStageId: string, newIndex: number) => Promise<void>;
  onAddStage: () => void;
  onAddTask: (stageId: string, templateStageId: string) => void;
  onEditTask: (task: TemplateTask) => void;
  onDeleteTask: (taskId: string) => void;
  onRemoveStage: (templateStageId: string) => void;
}

type DragItem = 
  | { type: "stage"; stage: TemplateStageWithTasks }
  | { type: "task"; task: TemplateTask };

export function TemplateStagesWithTasks({
  templateId,
  stages,
  tasks,
  taskDefinitions,
  priorities,
  isLoading = false,
  onStageReorder,
  onTaskReorder,
  onAddStage,
  onAddTask,
  onEditTask,
  onDeleteTask,
  onRemoveStage
}: TemplateStagesWithTasksProps) {
  // All stages expanded by default
  const [expandedStageIds, setExpandedStageIds] = useState<Set<string>>(
    () => new Set(stages.map(s => s.templateStageId))
  );
  const [activeItem, setActiveItem] = useState<DragItem | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Group stages by phase
  const phaseGroups = useMemo(() => {
    const preHire = stages.filter(s => (s.phase ?? "pre_hire") === "pre_hire")
      .sort((a, b) => a.orderIndex - b.orderIndex);
    const onboarding = stages.filter(s => s.phase === "onboarding")
      .sort((a, b) => a.orderIndex - b.orderIndex);
    return { pre_hire: preHire, onboarding };
  }, [stages]);

  // Group tasks by stage
  const tasksByStage = useMemo(() => {
    const map = new Map<string, TemplateTask[]>();
    stages.forEach(stage => {
      const stageTasks = tasks
        .filter(t => t.templateStageId === stage.templateStageId)
        .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
      map.set(stage.templateStageId, stageTasks);
    });
    return map;
  }, [stages, tasks]);

  const allExpandedToggle = () => {
    if (expandedStageIds.size === stages.length) {
      setExpandedStageIds(new Set());
    } else {
      setExpandedStageIds(new Set(stages.map(s => s.templateStageId)));
    }
  };

  const toggleStage = (templateStageId: string) => {
    setExpandedStageIds(prev => {
      const next = new Set(prev);
      if (next.has(templateStageId)) {
        next.delete(templateStageId);
      } else {
        next.add(templateStageId);
      }
      return next;
    });
  };

  const getTaskDefinitionName = (taskDefId: string) => {
    return taskDefinitions.find(td => td.id === taskDefId)?.name ?? "Unknown Task";
  };

  const getPriorityName = (priorityId: string | null) => {
    if (!priorityId) return null;
    return priorities.find(p => p.id === priorityId)?.name ?? null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const id = String(active.id);
    
    // Determine if dragging stage or task
    const stage = stages.find(s => s.templateStageId === id);
    if (stage) {
      setActiveItem({ type: "stage", stage });
    } else {
      const task = tasks.find(t => t.id === id);
      if (task) {
        setActiveItem({ type: "task", task });
      }
    }
  };

  const handleDragOver = (event: DragOverEvent) => {
    // This allows tasks to be dropped in different stages
    // The actual logic is handled in handleDragEnd
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveItem(null);

    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    // Determine if we're moving a stage or task
    const isStage = stages.some(s => s.templateStageId === activeId);
    
    if (isStage) {
      // Stage reordering
      const oldIndex = stages.findIndex(s => s.templateStageId === activeId);
      const newIndex = stages.findIndex(s => s.templateStageId === overId);
      
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

      // Create new order array
      const newOrder = [...stages];
      const [movedStage] = newOrder.splice(oldIndex, 1);
      newOrder.splice(newIndex, 0, movedStage);

      // Extract just the templateStageIds in new order
      const stageIdsInOrder = newOrder.map(s => s.templateStageId);

      try {
        await onStageReorder(stageIdsInOrder);
      } catch (error) {
        console.error("Failed to reorder stages:", error);
      }
    } else {
      // Task reordering/moving
      const task = tasks.find(t => t.id === activeId);
      if (!task) return;

      // Find if we're dropping on a stage or another task
      const targetStage = stages.find(s => s.templateStageId === overId);
      const targetTask = tasks.find(t => t.id === overId);

      let targetTemplateStageId: string;
      let targetStageId: string;
      let newIndex: number;

      if (targetStage) {
        // Dropped directly on a stage - put at the end
        targetTemplateStageId = targetStage.templateStageId;
        targetStageId = targetStage.stageId;
        const tasksInStage = tasksByStage.get(targetTemplateStageId) ?? [];
        newIndex = tasksInStage.length;
      } else if (targetTask) {
        // Dropped on another task - insert before it
        targetTemplateStageId = targetTask.templateStageId;
        targetStageId = targetTask.stageId;
        const tasksInStage = tasksByStage.get(targetTemplateStageId) ?? [];
        newIndex = tasksInStage.findIndex(t => t.id === targetTask.id);
      } else {
        return; // Invalid drop target
      }

      // Skip if same position
      if (task.templateStageId === targetTemplateStageId && task.orderIndex === newIndex) {
        return;
      }

      try {
        await onTaskReorder(task.id, targetStageId, targetTemplateStageId, newIndex);
      } catch (error) {
        console.error("Failed to reorder task:", error);
      }
    }
  };

  const renderPhaseGroup = (phaseKey: "pre_hire" | "onboarding", phaseStages: TemplateStageWithTasks[]) => {
    const phaseLabel = phaseKey === "pre_hire" ? "Pre Hire" : "Onboarding";
    
    return (
      <div key={phaseKey} className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            {phaseLabel}
          </h3>
          <Badge variant="secondary" className="text-xs">
            {phaseStages.length} {phaseStages.length === 1 ? "stage" : "stages"}
          </Badge>
        </div>
        
        <SortableContext items={phaseStages.map(s => s.templateStageId)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {phaseStages.map((stage) => {
              const stageTasks = tasksByStage.get(stage.templateStageId) ?? [];
              const isExpanded = expandedStageIds.has(stage.templateStageId);

              return (
                <SortableStageCard
                  key={stage.templateStageId}
                  stage={stage}
                  tasks={stageTasks}
                  isExpanded={isExpanded}
                  onToggle={() => toggleStage(stage.templateStageId)}
                  onAddTask={() => onAddTask(stage.stageId, stage.templateStageId)}
                  onRemove={() => onRemoveStage(stage.templateStageId)}
                  getTaskDefinitionName={getTaskDefinitionName}
                  getPriorityName={getPriorityName}
                  onEditTask={onEditTask}
                  onDeleteTask={onDeleteTask}
                />
              );
            })}
          </div>
        </SortableContext>
      </div>
    );
  };

  return (
    <div className="space-y-6 min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-base sm:text-lg font-semibold">Template Stages & Tasks</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={onAddStage}
            data-testid="button-add-template-stage"
          >
            <Plus className="mr-2 h-4 w-4 shrink-0" />
            Add Stage
          </Button>
          {stages.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={allExpandedToggle}
            >
              {expandedStageIds.size === stages.length ? (
                <>
                  <ChevronUp className="mr-2 h-4 w-4 shrink-0" />
                  <span className="hidden xs:inline">Collapse All</span>
                  <span className="xs:hidden">Collapse</span>
                </>
              ) : (
                <>
                  <ChevronDown className="mr-2 h-4 w-4 shrink-0" />
                  <span className="hidden xs:inline">Expand All</span>
                  <span className="xs:hidden">Expand</span>
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : stages.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <div className="text-muted-foreground mb-4">
            <p className="text-lg font-medium">No stages configured</p>
            <p className="text-sm">Add stages to define the hiring workflow for this template.</p>
          </div>
          <Button onClick={onAddStage} data-testid="button-add-first-stage">
            <Plus className="mr-2 h-4 w-4" />
            Add First Stage
          </Button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="space-y-6">
            {phaseGroups.pre_hire.length > 0 && renderPhaseGroup("pre_hire", phaseGroups.pre_hire)}
            {phaseGroups.onboarding.length > 0 && renderPhaseGroup("onboarding", phaseGroups.onboarding)}
          </div>

          <DragOverlay>
            {activeItem && activeItem.type === "stage" && (
              <div className="bg-card border rounded-lg p-3 shadow-lg opacity-90">
                <span className="font-medium">{activeItem.stage.stageName}</span>
              </div>
            )}
            {activeItem && activeItem.type === "task" && (
              <div className="bg-card border rounded-lg px-3 py-2 shadow-lg opacity-90">
                <span className="text-sm">{getTaskDefinitionName(activeItem.task.taskDefId)}</span>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
