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
import { toast } from 'sonner';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Archive } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface TemplateStage {
  templateStageId: string;
  stageId: string;
  stageName: string;
  orderIndex: number;
}

interface TemplateStagesListProps {
  templateId: string;
  stages: TemplateStage[];
}

function SortableRow({ id, name, index, isPending, templateStageId, onRemove }: { 
  id: string; 
  name: string; 
  index: number;
  isPending: boolean;
  templateStageId: string;
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
      data-testid={`sortable-stage-${id}`}
    >
      <button 
        aria-label="Drag stage to reorder"
        {...attributes} 
        {...listeners} 
        className="cursor-grab px-1 text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        disabled={isPending}
        data-testid={`drag-handle-${id}`}
      >
        ⋮⋮
      </button>
      <Badge variant="secondary" className="min-w-[2rem] justify-center">
        {index}
      </Badge>
      <span className="font-medium flex-1" data-testid={`stage-name-${id}`}>
        {name}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onRemove(templateStageId)}
        disabled={isPending}
        data-testid={`button-remove-stage-${templateStageId}`}
      >
        <Archive className="w-4 h-4" />
      </Button>
    </div>
  );
}

export function TemplateStagesList({ templateId, stages }: TemplateStagesListProps) {
  const queryClient = useQueryClient();
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
      toast.success('Stage order saved successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message);
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
      toast.success('Stage removed from template successfully');
    },
    onError: (error: Error) => {
      toast.error(error.message);
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

    const oldIndex = items.findIndex(item => item.stageId === active.id);
    const newIndex = items.findIndex(item => item.stageId === over.id);
    
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
            key={stage.stageId} 
            className="flex items-center gap-3 rounded-lg border p-3 bg-card"
            data-testid={`static-stage-${stage.stageId}`}
          >
            <Badge variant="secondary" className="min-w-[2rem] justify-center">
              {index + 1}
            </Badge>
            <span className="font-medium flex-1" data-testid={`stage-name-${stage.stageId}`}>
              {stage.stageName}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleRemoveStage(stage.templateStageId)}
              disabled={removeMutation.isPending}
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
        items={items.map(item => item.stageId)} 
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col gap-2" data-testid="template-stages-list">
          {items.map((stage, index) => (
            <SortableRow
              key={stage.stageId}
              id={stage.stageId}
              name={stage.stageName}
              index={index + 1}
              isPending={reorderMutation.isPending || removeMutation.isPending}
              templateStageId={stage.templateStageId}
              onRemove={handleRemoveStage}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}