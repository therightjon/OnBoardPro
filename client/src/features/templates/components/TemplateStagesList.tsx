import React, { useState, useEffect } from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Archive } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/shared/hooks/use-toast';

interface TemplateStage {
  templateStageId: string;
  stageId: string;
  stageName: string;
  orderIndex: number;
  phase?: string | null;
}

interface TemplateStagesListProps {
  templateId: string;
  stages: TemplateStage[];
}

function SortableRow({ id, stageId, name, phase, index, isPending, onRemove }: { 
  id: string; 
  stageId: string;
  name: string; 
  phase?: string | null;
  index: number;
  isPending: boolean;
  onRemove: (templateStageId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={`flex items-center gap-3 rounded-lg border p-3 bg-card ${
        isPending ? 'opacity-50 pointer-events-none' : ''
      }`}
      data-testid={`sortable-stage-${stageId}`}
    >
      <button 
        aria-label="Drag stage to reorder"
        {...attributes} 
        {...listeners} 
        className="cursor-grab px-1 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        disabled={isPending}
        data-testid={`drag-handle-${stageId}`}
      >
        ⋮⋮
      </button>
      <Badge variant="secondary" className="min-w-[2rem] justify-center">
        {index}
      </Badge>
      <div className="flex flex-col flex-1" data-testid={`stage-name-${id}`}>
        <span className="font-medium">{name}</span>
        {phase && (
          <span className="text-xs text-muted-foreground capitalize">{phase.replace('_', ' ')}</span>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onRemove(id)}
        disabled={isPending}
        aria-label={`Remove ${name}`}
        data-testid={`button-remove-stage-${id}`}
      >
        <Archive className="w-4 h-4" />
      </Button>
    </div>
  );
}

export function TemplateStagesList({ templateId, stages }: TemplateStagesListProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const sensors = useSensors(
    useSensor(PointerSensor, { 
      activationConstraint: { distance: 4 } 
    })
  );
  
  const [items, setItems] = useState<TemplateStage[]>([]);

  // Sort stages by order index and update local state
  useEffect(() => {
    const sortedStages = [...stages].sort((a, b) => a.orderIndex - b.orderIndex);
    setItems(sortedStages);
  }, [stages]);

  const reorderMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const response = await apiRequest("PATCH", `/api/templates/${templateId}/stages/reorder`, {
        stageIdsInOrder: orderedIds,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates", templateId, "template-stages"] });
      toast({ title: 'Stage order saved successfully' });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: 'destructive' });
      // Rollback by invalidating queries to refetch from server
      queryClient.invalidateQueries({ queryKey: ["/api/templates", templateId, "template-stages"] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (templateStageId: string) => {
      const response = await apiRequest("DELETE", `/api/template-stages/${templateStageId}`);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates", templateId, "template-stages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/templates", templateId] });
      toast({ title: 'Stage removed from template successfully' });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: 'destructive' });
    },
  });

  const handleRemoveStage = (templateStageId: string) => {
    removeMutation.mutate(templateStageId);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = items.findIndex(item => item.templateStageId === active.id);
    const newIndex = items.findIndex(item => item.templateStageId === over.id);
    
    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    // Optimistic update: reorder items locally
    const reorderedItems = arrayMove(items, oldIndex, newIndex).map((item, idx) => ({
      ...item,
      orderIndex: idx + 1
    }));
    
    setItems(reorderedItems);
    
    // Send reorder request to server
    const orderedIds = reorderedItems.map(item => item.stageId);
    reorderMutation.mutate(orderedIds);
  };

  // Don't render drag and drop if there are 0 or 1 stages
  if (items.length <= 1) {
    return (
      <div className="flex flex-col gap-2">
        {items.map((stage, index) => (
          <div 
            key={stage.templateStageId} 
            className="flex items-center gap-3 rounded-lg border p-3 bg-card"
            data-testid={`static-stage-${stage.stageId}`}
          >
            <Badge variant="secondary" className="min-w-[2rem] justify-center">
              {index + 1}
            </Badge>
            <div className="flex flex-col flex-1" data-testid={`stage-name-${stage.stageId}`}>
              <span className="font-medium">{stage.stageName}</span>
              {stage.phase && (
                <span className="text-xs text-muted-foreground capitalize">
                  {stage.phase.replace('_', ' ')}
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleRemoveStage(stage.templateStageId)}
              disabled={removeMutation.isPending}
              aria-label={`Remove ${stage.stageName}`}
              data-testid={`button-remove-stage-${stage.templateStageId}`}
            >
              <Archive className="w-4 h-4" />
            </Button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <SortableContext 
        items={items.map(item => item.templateStageId)} 
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col gap-4" data-testid="template-stages-list">
          {['pre_hire', 'onboarding'].map((phaseKey) => {
            const phaseStages = items.filter(stage => (stage.phase ?? 'pre_hire') === phaseKey);
            if (!phaseStages.length) return null;
            const readable = phaseKey.replace('_', ' ');
            return (
              <div key={phaseKey} className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold capitalize text-muted-foreground">{readable}</h4>
                  <Badge variant="outline" className="text-xs">
                    {phaseStages.length} Stage{phaseStages.length === 1 ? '' : 's'}
                  </Badge>
                </div>
                <div className="flex flex-col gap-2">
                  {phaseStages.map((stage) => (
                    <SortableRow
                      key={stage.templateStageId}
                      id={stage.templateStageId}
                      stageId={stage.stageId}
                      name={stage.stageName}
                      phase={stage.phase ?? null}
                      index={items.findIndex(item => item.templateStageId === stage.templateStageId) + 1}
                      isPending={reorderMutation.isPending || removeMutation.isPending}
                      onRemove={handleRemoveStage}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}
