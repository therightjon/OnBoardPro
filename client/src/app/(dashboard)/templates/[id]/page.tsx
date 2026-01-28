/**
 * Template Detail Page
 * Purpose: Dashboard page for viewing/editing a single template, its stages, and tasks with rich client-side orchestration.
 * Belongs: UI composition, data fetching, optimistic UX, and form state for template editing. Domain validation remains server-side.
 * Conventions: Reuse shared hooks/components where possible, avoid duplicating server rules, and keep mutation invalidations centralized.
 */
import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/shared/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { invalidateTemplate } from "@/lib/query-invalidate";
import { useToast } from "@/shared/hooks/use-toast";
import { RouteGuard } from "@/shared/components/route-guard";
import { 
  TemplateStatusControl, 
  TemplateStagesWithTasks, 
  PipelineEstimateSection, 
  AddStageForm,
  TemplateTaskFormDialog,
  type TemplateTaskFormValues
} from "@/features/templates";
import type { 
  Template, 
  TemplateTask,
  TemplateStage,
  TaskDefinition, 
  HiringStage, 
  User as UserType,
  TaskPriority,
  TaskCategory,
  CandidateType
} from "@shared/schemas";

// Helper function to convert template to status format
function getTemplateStatus(template: Template): "draft" | "active" | "archived" {
  if (template.archived) return "archived";
  if (template.isActive) return "active";
  return "draft";
}

export default function TemplateDetailPage() {
  const [, params] = useRoute("/templates/:id");
  const templateId = params?.id;
  const { toast } = useToast();
  
  // Dialog state
  const [isAddTaskDialogOpen, setIsAddTaskDialogOpen] = useState(false);
  const [isEditTaskDialogOpen, setIsEditTaskDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TemplateTask | null>(null);
  const [isAddStageDialogOpen, setIsAddStageDialogOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<TemplateTask | null>(null);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [preSelectedStageId, setPreSelectedStageId] = useState<string>("");
  
  // Inline editing state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editableName, setEditableName] = useState("");

  // Data queries
  const { data: template, isLoading: templateLoading } = useQuery<Template>({
    queryKey: ["/api/templates", templateId],
  });

  const { data: user } = useQuery<UserType>({
    queryKey: ["/api/user"],
  });

  const { data: templateTasks = [], isLoading: tasksLoading } = useQuery<TemplateTask[]>({
    queryKey: ["/api/templates", templateId, "template-tasks"],
  });

  const { data: taskDefinitions = [] } = useQuery<TaskDefinition[]>({
    queryKey: ["/api/task-definitions"],
  });

  const { data: hiringStages = [] } = useQuery<HiringStage[]>({
    queryKey: ["/api/hiring-stages"],
  });

  const { data: taskPriorities = [] } = useQuery<TaskPriority[]>({
    queryKey: ["/api/task-priorities"],
  });

  const { data: taskCategories = [] } = useQuery<TaskCategory[]>({
    queryKey: ["/api/task-categories"],
  });

  const { data: users = [] } = useQuery<UserType[]>({
    queryKey: ["/api/users/assignable"],
  });

  const { data: candidateTypes = [] } = useQuery<CandidateType[]>({
    queryKey: ["/api/candidate-types"],
  });

  const { data: templateStages = [], isLoading: stagesLoading } = useQuery<TemplateStage[]>({
    queryKey: ["/api/templates", templateId, "template-stages"],
  });

  // Set initial editable name when template data loads
  useEffect(() => {
    if (template && !isEditingName) {
      setEditableName(template.name);
    }
  }, [template, isEditingName]);

  // Mutations
  const createTemplateTaskMutation = useMutation({
    mutationFn: async (data: TemplateTaskFormValues) => {
      const res = await apiRequest("POST", `/api/templates/${templateId}/template-tasks`, data);
      return res.json();
    },
    onSuccess: () => {
      invalidateTemplate(queryClient, templateId!);
      setIsAddTaskDialogOpen(false);
      toast({
        title: "Success",
        description: "Template task added successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add task. Make sure the template has stages assigned.",
        variant: "destructive",
      });
    },
  });

  const updateTemplateTaskMutation = useMutation({
    mutationFn: async (data: TemplateTaskFormValues & { id: string }) => {
      const { id, ...updateData } = data;
      const res = await apiRequest("PATCH", `/api/template-tasks/${id}`, updateData);
      return res.json();
    },
    onSuccess: () => {
      invalidateTemplate(queryClient, templateId!);
      setIsEditTaskDialogOpen(false);
      setSelectedTask(null);
      toast({
        title: "Success",
        description: "Template task updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const archiveTemplateTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const res = await apiRequest("DELETE", `/api/template-tasks/${taskId}`);
      return res.json();
    },
    onSuccess: (result) => {
      invalidateTemplate(queryClient, templateId!);
      
      if (result.removedStage) {
        toast({
          title: "Success",
          description: "Template task archived and empty stage removed successfully",
        });
      } else {
        toast({
          title: "Success", 
          description: "Template task archived successfully",
        });
      }
      
      setTaskToDelete(null);
      setShowDeleteConfirmation(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      setTaskToDelete(null);
      setShowDeleteConfirmation(false);
    },
  });

  const updateTemplateNameMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("PATCH", `/api/templates/${templateId}`, { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates", templateId] });
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      setIsEditingName(false);
      toast({
        title: "Success",
        description: "Template name updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      if (template) {
        setEditableName(template.name);
      }
      setIsEditingName(false);
    },
  });

  const createStageWithTaskMutation = useMutation({
    mutationFn: async (data: { 
      stageId: string; 
      taskDefIds: string[];
      dueRuleType: string;
      dueRuleValue?: number | string | null;
      priorityId?: string | null;
      categoryId?: string | null;
      defaultAssigneeKind?: 'user' | 'role';
      defaultAssigneeUserId?: string | null;
      defaultAssigneeRole?: string | null;
      phase?: 'pre_hire' | 'onboarding';
    }) => {
      const res = await apiRequest("POST", `/api/templates/${templateId}/stages/create-with-task`, data);
      return res.json();
    },
    onSuccess: () => {
      invalidateTemplate(queryClient, templateId!);
      setIsAddStageDialogOpen(false);
      toast({
        title: "Success",
        description: "Stage and tasks added successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const removeTemplateStageMutation = useMutation({
    mutationFn: async (stageId: string) => {
      const res = await apiRequest("DELETE", `/api/template-stages/${stageId}`);
      return res;
    },
    onSuccess: () => {
      invalidateTemplate(queryClient, templateId!);
      toast({
        title: "Success",
        description: "Stage removed from template successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const reorderStagesMutation = useMutation({
    mutationFn: async (stageIdsInOrder: string[]) => {
      const res = await apiRequest("PATCH", `/api/templates/${templateId}/stages/reorder`, {
        stageIdsInOrder,
      });
      return res.json();
    },
    onSuccess: () => {
      invalidateTemplate(queryClient, templateId!);
      toast({
        title: "Success",
        description: "Stage order updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const reorderTaskMutation = useMutation({
    mutationFn: async ({ taskId, targetStageId, targetTemplateStageId, newIndex }: {
      taskId: string;
      targetStageId: string;
      targetTemplateStageId: string;
      newIndex: number;
    }) => {
      const res = await apiRequest("PATCH", `/api/templates/${templateId}/template-tasks/reorder`, {
        taskId,
        targetStageId,
        targetTemplateStageId,
        newIndex,
      });
      return res.json();
    },
    onSuccess: () => {
      invalidateTemplate(queryClient, templateId!);
      toast({
        title: "Success",
        description: "Task order updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Event handlers
  const handleNameClick = () => {
    if (!template) return;
    setIsEditingName(true);
    setEditableName(template.name);
  };

  const handleNameSave = () => {
    if (!template || editableName.trim() === "") {
      setEditableName(template?.name || "");
      setIsEditingName(false);
      return;
    }
    
    if (editableName.trim() !== template.name) {
      updateTemplateNameMutation.mutate(editableName.trim());
    } else {
      setIsEditingName(false);
    }
  };

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleNameSave();
    } else if (e.key === "Escape") {
      setEditableName(template?.name || "");
      setIsEditingName(false);
    }
  };

  const handleEditTask = (task: TemplateTask) => {
    setSelectedTask(task);
    setIsEditTaskDialogOpen(true);
  };

  const handleDeleteTask = (task: TemplateTask) => {
    setTaskToDelete(task);
    const tasksInSameStage = templateTasks.filter(t => t.stageId === task.stageId);
    if (tasksInSameStage.length === 1) {
      setShowDeleteConfirmation(true);
    } else {
      archiveTemplateTaskMutation.mutate(task.id);
    }
  };

  const handleAddTask = (data: TemplateTaskFormValues) => {
    if (existingTaskDefIds.has(data.taskDefId)) {
      toast({
        title: "Cannot add task",
        description: "This task definition is already in the template.",
        variant: "destructive",
      });
      return;
    }
    createTemplateTaskMutation.mutate(data);
  };

  const handleEditTaskSubmit = (data: TemplateTaskFormValues) => {
    if (!selectedTask) return;
    updateTemplateTaskMutation.mutate({ ...data, id: selectedTask.id });
  };

  // Computed values
  const existingTaskDefIds = useMemo(() => 
    new Set(templateTasks.map(t => t.taskDefId)),
    [templateTasks]
  );

  const getTaskDefinitionName = (taskDefId: string) => {
    const taskDef = taskDefinitions.find(td => td.id === taskDefId);
    return taskDef?.name || "Unknown Task";
  };

  const getStageName = (stageId: string) => {
    const stage = hiringStages.find(s => s.id === stageId);
    return stage?.name || "Unknown Stage";
  };

  // Loading state
  if (templateLoading || tasksLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="h-32 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-center text-muted-foreground">Template not found</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <RouteGuard allowedRoles={["system_admin", "hr_staff"]}>
      <div className="p-4 sm:p-6 space-y-6 min-w-0">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 min-w-0">
            <Link href="/templates">
              <Button variant="ghost" size="sm" className="w-fit">
                <ArrowLeft className="w-4 h-4 mr-2 shrink-0" />
                Back to Templates
              </Button>
            </Link>
            <div className="min-w-0">
              {isEditingName ? (
                <input
                  type="text"
                  value={editableName}
                  onChange={(e) => setEditableName(e.target.value)}
                  onBlur={handleNameSave}
                  onKeyDown={handleNameKeyDown}
                  className="text-xl sm:text-2xl font-bold text-foreground bg-transparent border-none outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 rounded px-1 -mx-1 w-full"
                  data-testid="input-template-name-edit"
                  autoFocus
                />
              ) : (
                <h1
                  className="text-xl sm:text-2xl font-bold text-foreground cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors truncate"
                  onClick={handleNameClick}
                  data-testid="text-template-title"
                  title="Click to edit template name"
                >
                  {template.name}
                </h1>
              )}
              <p className="text-sm text-muted-foreground">Configure template tasks</p>
            </div>
          </div>
          <TemplateStatusControl
            templateId={templateId!}
            value={getTemplateStatus(template)}
            canEdit={user?.role === "system_admin" || user?.role === "hr_staff"}
          />
        </div>

        {/* Template Info */}
        <Card className="overflow-hidden">
          <CardContent className="pt-6 min-w-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Candidate Type</h3>
                <p className="text-base font-medium break-words">
                  {candidateTypes.find(ct => ct.id === template.candidateTypeId)?.name || "Not specified"}
                </p>
              </div>
              {template.description && (
                <div className="md:col-span-2">
                  <h3 className="text-sm font-medium text-muted-foreground mb-1">Description</h3>
                  <p className="text-base break-words">{template.description}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Pipeline Estimate */}
        <PipelineEstimateSection 
          templateId={templateId!} 
          templateTasks={templateTasks}
          getTaskDefinitionName={getTaskDefinitionName}
        />

        {/* Template Stages & Tasks - Unified View */}
        <Card className="overflow-hidden">
          <CardContent className="pt-6 min-w-0">
            <TemplateStagesWithTasks
              templateId={templateId!}
              stages={templateStages.map(ts => {
                const stage = hiringStages.find(s => s.id === ts.stageId);
                return {
                  templateStageId: ts.id,
                  stageId: ts.stageId,
                  stageName: stage?.name || 'Unknown Stage',
                  orderIndex: ts.orderIndex,
                  phase: ts.phase ?? 'pre_hire'
                };
              })}
              tasks={templateTasks}
              taskDefinitions={taskDefinitions}
              priorities={taskPriorities}
              isLoading={stagesLoading || tasksLoading}
              onStageReorder={async (stageIdsInOrder) => {
                await reorderStagesMutation.mutateAsync(stageIdsInOrder);
              }}
              onTaskReorder={async (taskId, targetStageId, targetTemplateStageId, newIndex) => {
                await reorderTaskMutation.mutateAsync({
                  taskId,
                  targetStageId,
                  targetTemplateStageId,
                  newIndex
                });
              }}
              onAddStage={() => setIsAddStageDialogOpen(true)}
              onAddTask={(stageId, templateStageId) => {
                setPreSelectedStageId(stageId);
                setIsAddTaskDialogOpen(true);
              }}
              onEditTask={handleEditTask}
              onDeleteTask={(taskId) => {
                const task = templateTasks.find(t => t.id === taskId);
                if (task) handleDeleteTask(task);
              }}
              onRemoveStage={(templateStageId) => removeTemplateStageMutation.mutate(templateStageId)}
            />
          </CardContent>
        </Card>

        {/* Add Stage Dialog */}
        <Dialog open={isAddStageDialogOpen} onOpenChange={setIsAddStageDialogOpen}>
          <DialogContent className="max-w-[95vw] w-full sm:max-w-2xl max-h-[90vh] sm:max-h-min overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Stage to Template</DialogTitle>
              <DialogDescription className="sr-only">
                Select a hiring stage and configure tasks to add to this template.
              </DialogDescription>
            </DialogHeader>
            <AddStageForm 
              templateId={templateId!} 
              hiringStages={hiringStages}
              templateStages={templateStages}
              templateTasks={templateTasks}
              taskDefinitions={taskDefinitions}
              createStageWithTaskMutation={createStageWithTaskMutation}
              onClose={() => setIsAddStageDialogOpen(false)} 
            />
          </DialogContent>
        </Dialog>

        {/* Add Task Dialog */}
        <TemplateTaskFormDialog
          mode="add"
          open={isAddTaskDialogOpen}
          onOpenChange={(open) => {
            setIsAddTaskDialogOpen(open);
            if (!open) setPreSelectedStageId("");
          }}
          onSubmit={handleAddTask}
          isPending={createTemplateTaskMutation.isPending}
          taskDefinitions={taskDefinitions}
          templateStages={templateStages}
          hiringStages={hiringStages}
          users={users}
          taskPriorities={taskPriorities}
          taskCategories={taskCategories}
          existingTaskDefIds={existingTaskDefIds}
          preSelectedStageId={preSelectedStageId}
        />

        {/* Edit Task Dialog */}
        <TemplateTaskFormDialog
          mode="edit"
          open={isEditTaskDialogOpen}
          onOpenChange={(open) => {
            setIsEditTaskDialogOpen(open);
            if (!open) setSelectedTask(null);
          }}
          onSubmit={handleEditTaskSubmit}
          isPending={updateTemplateTaskMutation.isPending}
          taskDefinitions={taskDefinitions}
          templateStages={templateStages}
          hiringStages={hiringStages}
          users={users}
          taskPriorities={taskPriorities}
          taskCategories={taskCategories}
          selectedTask={selectedTask}
        />

        {/* Confirmation dialog for deleting last task in stage */}
        <AlertDialog open={showDeleteConfirmation} onOpenChange={setShowDeleteConfirmation}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Stage from Template?</AlertDialogTitle>
              <AlertDialogDescription>
                This is the last task in "{taskToDelete ? getStageName(taskToDelete.stageId) : ''}" stage. 
                Removing it will also remove the entire stage from this template. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => {
                setTaskToDelete(null);
                setShowDeleteConfirmation(false);
              }}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => taskToDelete && archiveTemplateTaskMutation.mutate(taskToDelete.id)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={archiveTemplateTaskMutation.isPending}
              >
                {archiveTemplateTaskMutation.isPending ? "Removing..." : "Remove Task & Stage"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </RouteGuard>
  );
}
