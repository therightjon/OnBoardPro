import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/shared/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/shared/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/shared/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Input } from "@/shared/components/ui/input";
import { Plus, Archive, ArrowLeft, Calendar, User, Edit } from "lucide-react";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { invalidateTemplate } from "@/lib/query-invalidate";
import { useToast } from "@/shared/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { RouteGuard } from "@/shared/components/route-guard";
import { TemplateStatusControl } from "@/features/templates/components/template-status-control";
import { TemplateStagesList } from "@/features/templates/components/TemplateStagesList";
import { PerStageMiniBar } from "@/features/templates/components/PerStageMiniBar";
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

const templateTaskSchema = z.object({
  taskDefId: z.string().min(1, "Task definition is required"),
  stageId: z.string().min(1, "Stage is required"),
  dueRuleType: z.enum(["days_before_start", "on_start_date", "days_after_start", "days_before_stage", "days_after_stage", "fixed_date"]),
  dueRuleValue: z.number().optional(),
  fixedDate: z.string().optional(),
  defaultAssigneeId: z.string().optional(),
  defaultPriorityId: z.string().optional(),
  defaultCategoryId: z.string().optional(),
  isRequired: z.boolean().optional(),
});

type TemplateTaskForm = z.infer<typeof templateTaskSchema>;

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
  const [isAddTaskDialogOpen, setIsAddTaskDialogOpen] = useState(false);
  const [isEditTaskDialogOpen, setIsEditTaskDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TemplateTask | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editableName, setEditableName] = useState("");
  const [isAddStageDialogOpen, setIsAddStageDialogOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<TemplateTask | null>(null);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);

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

  const form = useForm<TemplateTaskForm>({
    resolver: zodResolver(templateTaskSchema),
    defaultValues: {
      taskDefId: "",
      stageId: "",
      dueRuleType: "days_after_start",
      dueRuleValue: 0,
      fixedDate: "",
      defaultAssigneeId: "none",
      defaultPriorityId: "none",
      defaultCategoryId: "none",
      isRequired: false,
    },
  });

  const editForm = useForm<TemplateTaskForm>({
    resolver: zodResolver(templateTaskSchema),
    defaultValues: {
      taskDefId: "",
      stageId: "",
      dueRuleType: "days_after_start",
      dueRuleValue: 0,
      fixedDate: "",
      defaultAssigneeId: "none",
      defaultPriorityId: "none",
      defaultCategoryId: "none",
      isRequired: false,
    },
  });

  const createTemplateTaskMutation = useMutation({
    mutationFn: async (data: TemplateTaskForm) => {
      const res = await apiRequest("POST", `/api/templates/${templateId}/template-tasks`, data);
      return res.json();
    },
    onSuccess: () => {
      invalidateTemplate(queryClient, templateId!);
      setIsAddTaskDialogOpen(false);
      form.reset();
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
    mutationFn: async (data: TemplateTaskForm & { id: string }) => {
      const { id, ...updateData } = data;
      const res = await apiRequest("PATCH", `/api/template-tasks/${id}`, updateData);
      return res.json();
    },
    onSuccess: () => {
      invalidateTemplate(queryClient, templateId!);
      setIsEditTaskDialogOpen(false);
      setSelectedTask(null);
      editForm.reset();
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
      
      // Check if a stage was also removed
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
      
      // Reset dialog state
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
      // Reset to original name on error
      if (template) {
        setEditableName(template.name);
      }
      setIsEditingName(false);
    },
  });

  const createTemplateStageMutation = useMutation({
    mutationFn: async (data: { stageId: string; orderIndex?: number }) => {
      const res = await apiRequest("POST", `/api/templates/${templateId}/template-stages`, data);
      return res.json();
    },
    onSuccess: () => {
      // Invalidate template data to update stages and status badge
      invalidateTemplate(queryClient, templateId!);
      toast({
        title: "Success",
        description: "Stage added to template successfully",
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

  // Atomic mutation for creating stage with tasks
  const createStageWithTaskMutation = useMutation({
    mutationFn: async (data: { 
      stageId: string; 
      taskDefIds: string[];
      dueRuleType: string;
      dueRuleValue?: number | string | null;
      priorityId?: string | null;
      categoryId?: string | null;
      assigneeId?: string | null;
    }) => {
      const res = await apiRequest("POST", `/api/templates/${templateId}/stages/create-with-task`, data);
      return res.json();
    },
    onSuccess: () => {
      // Invalidate template data comprehensively 
      invalidateTemplate(queryClient, templateId!);
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
      // Invalidate template data to update stages and status badge
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

  const handleRemoveStage = (templateStageId: string) => {
    removeTemplateStageMutation.mutate(templateStageId);
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
    // Pre-populate edit form with current values
    editForm.reset({
      taskDefId: task.taskDefId,
      stageId: task.stageId,
      dueRuleType: task.dueRuleType,
      dueRuleValue: task.dueRuleValue || 0,
      fixedDate: task.fixedDate || "",
      defaultAssigneeId: task.defaultAssigneeId || "none",
      defaultPriorityId: task.defaultPriorityId || "none",
      defaultCategoryId: task.defaultCategoryId || "none",
      isRequired: !!(task as any).isRequired,
    });
    setIsEditTaskDialogOpen(true);
  };

  const onSubmit = (data: TemplateTaskForm) => {
    // Convert "none" values back to null for the API
    const processedData = {
      ...data,
      defaultAssigneeId: data.defaultAssigneeId === "none" ? undefined : data.defaultAssigneeId,
      defaultPriorityId: data.defaultPriorityId === "none" ? undefined : data.defaultPriorityId,
      defaultCategoryId: data.defaultCategoryId === "none" ? undefined : data.defaultCategoryId,
      isRequired: !!data.isRequired,
    };
    createTemplateTaskMutation.mutate(processedData);
  };

  const onEditSubmit = (data: TemplateTaskForm) => {
    if (!selectedTask) return;
    // Convert "none" values and empty strings back to null for the API
    const processedData = {
      ...data,
      id: selectedTask.id,
      defaultAssigneeId: data.defaultAssigneeId === "none" ? undefined : data.defaultAssigneeId,
      defaultPriorityId: data.defaultPriorityId === "none" ? undefined : data.defaultPriorityId,
      defaultCategoryId: data.defaultCategoryId === "none" ? undefined : data.defaultCategoryId,
      fixedDate: data.fixedDate === "" ? undefined : data.fixedDate,
      dueRuleValue: data.dueRuleType === "fixed_date" ? undefined : data.dueRuleValue,
      isRequired: !!data.isRequired,
    };
    updateTemplateTaskMutation.mutate(processedData);
  };

  const getTaskDefinitionName = (taskDefId: string) => {
    const taskDef = taskDefinitions.find(td => td.id === taskDefId);
    return taskDef?.name || "Unknown Task";
  };

  // Function to check if a task is the last one in its stage
  const isLastTaskInStage = (task: TemplateTask): boolean => {
    const tasksInSameStage = templateTasks.filter(t => t.stageId === task.stageId);
    return tasksInSameStage.length === 1;
  };

  // Function to handle task deletion with confirmation
  const handleDeleteTask = (task: TemplateTask) => {
    setTaskToDelete(task);
    if (isLastTaskInStage(task)) {
      setShowDeleteConfirmation(true);
    } else {
      // Not the last task, delete immediately
      archiveTemplateTaskMutation.mutate(task.id);
    }
  };

  // Function to confirm deletion
  const confirmDeleteTask = () => {
    if (taskToDelete) {
      archiveTemplateTaskMutation.mutate(taskToDelete.id);
    }
  };

  const getStageName = (stageId: string) => {
    const stage = hiringStages.find(s => s.id === stageId);
    return stage?.name || "Unknown Stage";
  };

  const getPriorityName = (priorityId: string | null) => {
    if (!priorityId) return "None";
    const priority = taskPriorities.find(p => p.id === priorityId);
    return priority?.name || "Unknown";
  };

  const getCategoryName = (categoryId: string | null) => {
    if (!categoryId) return "None";
    const category = taskCategories.find(c => c.id === categoryId);
    return category?.name || "Unknown";
  };

  const getUserName = (userId: string | null) => {
    if (!userId) return "Unassigned";
    const user = users.find(u => u.id === userId);
    return user ? `${user.firstName} ${user.lastName}` : "Unknown User";
  };

  const formatDueRule = (task: TemplateTask) => {
    switch (task.dueRuleType) {
      case "days_before_start":
        return `${task.dueRuleValue || 0} days before start`;
      case "on_start_date":
        return "On start date";
      case "days_after_start":
        return `${task.dueRuleValue || 0} days after start`;
      case "days_before_stage":
        return `${task.dueRuleValue || 0} days before stage`;
      case "days_after_stage":
        return `${task.dueRuleValue || 0} days after stage`;
      case "fixed_date":
        return task.fixedDate ? `Fixed date: ${new Date(task.fixedDate).toLocaleDateString()}` : "Fixed date";
      default:
        return "Unknown rule";
    }
  };

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
      <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/templates">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Templates
            </Button>
          </Link>
          <div>
            {isEditingName ? (
              <input
                type="text"
                value={editableName}
                onChange={(e) => setEditableName(e.target.value)}
                onBlur={handleNameSave}
                onKeyDown={handleNameKeyDown}
                className="text-2xl font-bold text-foreground bg-transparent border-none outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 rounded px-1 -mx-1 w-full"
                data-testid="input-template-name-edit"
                autoFocus
              />
            ) : (
              <h1 
                className="text-2xl font-bold text-foreground cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors" 
                onClick={handleNameClick}
                data-testid="text-template-title"
                title="Click to edit template name"
              >
                {template.name}
              </h1>
            )}
            <p className="text-muted-foreground">Configure template tasks</p>
          </div>
        </div>
        <TemplateStatusControl
          templateId={templateId!}
          value={getTemplateStatus(template)}
          canEdit={user?.role === "system_admin" || user?.role === "hr_staff"}
        />
      </div>

      {/* Template Info */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-1">Candidate Type</h3>
              <p className="text-base font-medium">
                {candidateTypes.find(ct => ct.id === template.candidateTypeId)?.name || "Not specified"}
              </p>
            </div>
            {template.description && (
              <div className="md:col-span-2">
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Description</h3>
                <p className="text-base">{template.description}</p>
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

      {/* Template Stages */}
      <Card className="mb-6" id="template-stages-section">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Template Stages</CardTitle>
          <Dialog open={isAddStageDialogOpen} onOpenChange={setIsAddStageDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-template-stage">
                <Plus className="w-4 h-4 mr-2" />
                Add Stage
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[95vw] w-full sm:max-w-2xl max-h-[90vh] sm:max-h-min overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Stage to Template</DialogTitle>
              </DialogHeader>
              <AddStageForm 
                templateId={templateId!} 
                hiringStages={hiringStages}
                templateStages={templateStages}
                taskDefinitions={taskDefinitions}
                taskPriorities={taskPriorities}
                taskCategories={taskCategories}
                users={users}
                createStageWithTaskMutation={createStageWithTaskMutation}
                onClose={() => setIsAddStageDialogOpen(false)} 
              />
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {stagesLoading ? (
            <div className="text-center py-4">Loading stages...</div>
          ) : templateStages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No stages configured for this template. Add stages to define the hiring flow.
            </div>
          ) : (
            <TemplateStagesList 
              templateId={templateId!}
              stages={templateStages.map(ts => {
                const stage = hiringStages.find(s => s.id === ts.stageId);
                return {
                  templateStageId: ts.id,
                  stageId: ts.stageId,
                  stageName: stage?.name || 'Unknown Stage',
                  orderIndex: ts.orderIndex
                };
              })}
            />
          )}
        </CardContent>
      </Card>

      {/* Template Tasks */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Template Tasks</CardTitle>
          <Dialog open={isAddTaskDialogOpen} onOpenChange={setIsAddTaskDialogOpen}>
            <DialogTrigger asChild>
              <div className="relative">
                <Button 
                  data-testid="button-add-template-task"
                  disabled={templateStages.length === 0}
                  className={templateStages.length === 0 ? "cursor-not-allowed" : ""}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Task
                </Button>
                {templateStages.length === 0 && (
                  <div className="absolute -top-10 left-0 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 hover:opacity-100 pointer-events-none transition-opacity">
                    Add a stage first
                  </div>
                )}
              </div>
            </DialogTrigger>
            <DialogContent className="max-w-[95vw] w-full sm:max-w-2xl max-h-[90vh] sm:max-h-min overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Task to Template</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="taskDefId"
                    render={({ field }: { field: any }) => (
                      <FormItem>
                        <FormLabel>Task Definition</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-task-definition">
                              <SelectValue placeholder="Select task definition" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {taskDefinitions
                              .filter(td => !td.archived)
                              .map((taskDef) => (
                              <SelectItem key={taskDef.id} value={taskDef.id}>
                                {taskDef.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="stageId"
                    render={({ field }: { field: any }) => (
                      <FormItem>
                        <FormLabel>Hiring Stage</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-stage">
                              <SelectValue placeholder="Select hiring stage" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {templateStages.map((templateStage) => {
                              const stage = hiringStages.find(s => s.id === templateStage.stageId);
                              return stage ? (
                                <SelectItem key={stage.id} value={stage.id}>
                                  {stage.name}
                                </SelectItem>
                              ) : null;
                            })}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="dueRuleType"
                    render={({ field }: { field: any }) => (
                      <FormItem>
                        <FormLabel>Due Rule Type</FormLabel>
                        <Select onValueChange={(value) => {
                          field.onChange(value);
                          // Auto-null inappropriate fields based on due rule type
                          if (value === "on_start_date") {
                            form.setValue("dueRuleValue", undefined);
                            form.setValue("fixedDate", undefined);
                          } else if (value === "fixed_date") {
                            form.setValue("dueRuleValue", undefined);
                          } else if (["days_before_start", "days_after_start", "days_before_stage", "days_after_stage"].includes(value)) {
                            form.setValue("fixedDate", undefined);
                          }
                        }} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-due-rule-type">
                              <SelectValue placeholder="Select due rule type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="days_before_start">Days Before Start Date</SelectItem>
                            <SelectItem value="on_start_date">On Start Date</SelectItem>
                            <SelectItem value="days_after_start">Days After Start Date</SelectItem>
                            <SelectItem value="days_before_stage">Days Before Stage</SelectItem>
                            <SelectItem value="days_after_stage">Days After Stage</SelectItem>
                            <SelectItem value="fixed_date">Fixed Date</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {form.watch("dueRuleType") && ["days_before_start", "days_after_start", "days_before_stage", "days_after_stage"].includes(form.watch("dueRuleType")) && (
                    <FormField
                      control={form.control}
                      name="dueRuleValue"
                      render={({ field }: { field: any }) => (
                        <FormItem>
                          <FormLabel>Days</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="Enter number of days"
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                              data-testid="input-due-rule-value"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {form.watch("dueRuleType") === "fixed_date" && (
                    <FormField
                      control={form.control}
                      name="fixedDate"
                      render={({ field }: { field: any }) => (
                        <FormItem>
                          <FormLabel>Fixed Date</FormLabel>
                          <FormControl>
                            <Input
                              type="date"
                              {...field}
                              data-testid="input-fixed-date"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="defaultAssigneeId"
                      render={({ field }: { field: any }) => (
                        <FormItem>
                          <FormLabel>Default Assignee (Optional)</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-default-assignee">
                                <SelectValue placeholder="Select assignee" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              {users.map((user) => (
                                <SelectItem key={user.id} value={user.id}>
                                  {`${user.firstName} ${user.lastName}`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="defaultPriorityId"
                      render={({ field }: { field: any }) => (
                        <FormItem>
                          <FormLabel>Default Priority (Optional)</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-default-priority">
                                <SelectValue placeholder="Select priority" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              {taskPriorities.map((priority) => (
                                <SelectItem key={priority.id} value={priority.id}>
                                  {priority.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="defaultCategoryId"
                      render={({ field }: { field: any }) => (
                        <FormItem>
                          <FormLabel>Default Category (Optional)</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-default-category">
                                <SelectValue placeholder="Select category" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              {taskCategories.map((category) => (
                                <SelectItem key={category.id} value={category.id}>
                                  {category.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Required checkbox */}
                  <div className="pt-2 border-t">
                    <div className="flex items-center space-x-2">
                      <Checkbox id="is-required" checked={!!form.watch('isRequired')} onCheckedChange={(v:any)=> form.setValue('isRequired', !!v)} />
                      <label htmlFor="is-required" className="text-sm">Task is required</label>
                    </div>
                  </div>

                  <div className="flex justify-end space-x-2">
                    <Button type="button" variant="outline" onClick={() => setIsAddTaskDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createTemplateTaskMutation.isPending}>
                      {createTemplateTaskMutation.isPending ? "Adding..." : "Add Task"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>

          {/* Edit Task Dialog */}
          <Dialog open={isEditTaskDialogOpen} onOpenChange={setIsEditTaskDialogOpen}>
            <DialogContent className="max-w-[95vw] w-full sm:max-w-2xl max-h-[90vh] sm:max-h-min overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit Template Task</DialogTitle>
              </DialogHeader>
              <Form {...editForm}>
                <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
                  <FormField
                    control={editForm.control}
                    name="taskDefId"
                    render={({ field }: { field: any }) => (
                      <FormItem>
                        <FormLabel>Task Definition</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="edit-select-task-definition">
                              <SelectValue placeholder="Select task definition" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {taskDefinitions
                              .filter(td => !td.archived)
                              .map((taskDef) => (
                              <SelectItem key={taskDef.id} value={taskDef.id}>
                                {taskDef.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={editForm.control}
                    name="stageId"
                    render={({ field }: { field: any }) => (
                      <FormItem>
                        <FormLabel>Hiring Stage</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="edit-select-stage">
                              <SelectValue placeholder="Select hiring stage" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {hiringStages.map((stage) => (
                              <SelectItem key={stage.id} value={stage.id}>
                                {stage.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={editForm.control}
                    name="dueRuleType"
                    render={({ field }: { field: any }) => (
                      <FormItem>
                        <FormLabel>Due Rule Type</FormLabel>
                        <Select onValueChange={(value) => {
                          field.onChange(value);
                          // Auto-null inappropriate fields based on due rule type
                          if (value === "on_start_date") {
                            editForm.setValue("dueRuleValue", undefined);
                            editForm.setValue("fixedDate", undefined);
                          } else if (value === "fixed_date") {
                            editForm.setValue("dueRuleValue", undefined);
                          } else if (["days_before_start", "days_after_start", "days_before_stage", "days_after_stage"].includes(value)) {
                            editForm.setValue("fixedDate", undefined);
                          }
                        }} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="edit-select-due-rule-type">
                              <SelectValue placeholder="Select due rule type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="days_before_start">Days Before Start Date</SelectItem>
                            <SelectItem value="on_start_date">On Start Date</SelectItem>
                            <SelectItem value="days_after_start">Days After Start Date</SelectItem>
                            <SelectItem value="days_before_stage">Days Before Stage</SelectItem>
                            <SelectItem value="days_after_stage">Days After Stage</SelectItem>
                            <SelectItem value="fixed_date">Fixed Date</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {editForm.watch("dueRuleType") && ["days_before_start", "days_after_start", "days_before_stage", "days_after_stage"].includes(editForm.watch("dueRuleType")) && (
                    <FormField
                      control={editForm.control}
                      name="dueRuleValue"
                      render={({ field }: { field: any }) => (
                        <FormItem>
                          <FormLabel>Days</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="Enter number of days"
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                              data-testid="edit-input-due-rule-value"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {editForm.watch("dueRuleType") === "fixed_date" && (
                    <FormField
                      control={editForm.control}
                      name="fixedDate"
                      render={({ field }: { field: any }) => (
                        <FormItem>
                          <FormLabel>Fixed Date</FormLabel>
                          <FormControl>
                            <Input
                              type="date"
                              {...field}
                              data-testid="edit-input-fixed-date"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={editForm.control}
                      name="defaultAssigneeId"
                      render={({ field }: { field: any }) => (
                        <FormItem>
                          <FormLabel>Default Assignee (Optional)</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="edit-select-default-assignee">
                                <SelectValue placeholder="Select assignee" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              {users.map((user) => (
                                <SelectItem key={user.id} value={user.id}>
                                  {`${user.firstName} ${user.lastName}`}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={editForm.control}
                      name="defaultPriorityId"
                      render={({ field }: { field: any }) => (
                        <FormItem>
                          <FormLabel>Default Priority (Optional)</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="edit-select-default-priority">
                                <SelectValue placeholder="Select priority" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              {taskPriorities.map((priority) => (
                                <SelectItem key={priority.id} value={priority.id}>
                                  {priority.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={editForm.control}
                      name="defaultCategoryId"
                      render={({ field }: { field: any }) => (
                        <FormItem>
                          <FormLabel>Default Category (Optional)</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="edit-select-default-category">
                                <SelectValue placeholder="Select category" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              {taskCategories.map((category) => (
                                <SelectItem key={category.id} value={category.id}>
                                  {category.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Required checkbox */}
                  <div className="pt-2 border-t">
                    <div className="flex items-center space-x-2">
                      <Checkbox id="edit-is-required" checked={!!editForm.watch('isRequired')} onCheckedChange={(v:any)=> editForm.setValue('isRequired', !!v)} />
                      <label htmlFor="edit-is-required" className="text-sm">Task is required</label>
                    </div>
                  </div>

                  <div className="flex justify-end space-x-2">
                    <Button type="button" variant="outline" onClick={() => setIsEditTaskDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={updateTemplateTaskMutation.isPending}>
                      {updateTemplateTaskMutation.isPending ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Due Rule</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Default Assignee</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templateTasks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No tasks configured for this template. Add tasks from the library.
                  </TableCell>
                </TableRow>
              ) : (
                templateTasks.map((task: TemplateTask) => (
                  <TableRow key={task.id} className="hover:bg-muted/50">
                    <TableCell className="font-medium">
                      {getTaskDefinitionName(task.taskDefId)}
                    </TableCell>
                    <TableCell>{getStageName(task.stageId)}</TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <span>{formatDueRule(task)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {getPriorityName(task.defaultPriorityId)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <User className="w-4 h-4 text-muted-foreground" />
                        <span>{getUserName(task.defaultAssigneeId)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditTask(task)}
                          data-testid={`button-edit-template-task-${task.id}`}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteTask(task)}
                          disabled={archiveTemplateTaskMutation.isPending}
                          data-testid={`button-archive-template-task-${task.id}`}
                        >
                          <Archive className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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
              onClick={confirmDeleteTask}
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

// Pipeline Estimate Section Component
function PipelineEstimateSection({ 
  templateId, 
  templateTasks, 
  getTaskDefinitionName 
}: { 
  templateId: string;
  templateTasks: TemplateTask[];
  getTaskDefinitionName: (taskDefId: string) => string;
}) {
  const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  const { data: estimate, isLoading, error } = useQuery({
    queryKey: ['/api/templates', templateId, 'estimate', { startDate, businessDays: true }, templateTasks, getTaskDefinitionName],
    queryFn: async () => {
      const params = new URLSearchParams({
        startDate,
        businessDays: 'true'
      });
      const response = await apiRequest('GET', `/api/templates/${templateId}/estimate?${params}`);
      return response.json();
    },
    enabled: !!templateId && !!startDate
  });

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          Pipeline Duration Estimate
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Configuration */}
        <div className="flex flex-col sm:flex-row gap-4 pb-4 border-b">
          <div className="flex-1">
            <label className="text-sm font-medium text-muted-foreground mb-1 block">
              Start Date
            </label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              data-testid="input-estimate-start-date"
              className="w-full sm:w-auto"
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

            {/* Non-Estimable Tasks */}
            {estimate.nonEstimable && estimate.nonEstimable.length > 0 && (
              <div>
                <h4 className="font-medium mb-2 text-amber-700 dark:text-amber-400">
                  Tasks Not Included in Estimate
                </h4>
                <div className="text-sm text-muted-foreground space-y-1">
                  {estimate.nonEstimable.map((item: any, index: number) => {
                    // item.taskId is a template task ID, need to find the task definition ID
                    const templateTask = templateTasks.find(tt => tt.id === item.taskId);
                    const taskName = templateTask ? getTaskDefinitionName(templateTask.taskDefId) : `Task ${item.taskId.slice(0, 8)}...`;
                    return (
                      <div key={index} className="flex justify-between">
                        <span>{taskName}</span>
                        <span className="italic">{item.reason}</span>
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

// AddStageForm Component
interface AddStageFormProps {
  templateId: string;
  hiringStages: HiringStage[];
  templateStages: TemplateStage[];
  taskDefinitions: TaskDefinition[];
  taskPriorities: TaskPriority[];
  taskCategories: TaskCategory[];
  users: UserType[];
  createStageWithTaskMutation: any;
  onClose: () => void;
}

function AddStageForm({ 
  templateId, 
  hiringStages, 
  templateStages, 
  taskDefinitions,
  taskPriorities,
  taskCategories,
  users,
  createStageWithTaskMutation, 
  onClose 
}: AddStageFormProps) {
  const [selectedStageId, setSelectedStageId] = useState("");
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [dueRuleType, setDueRuleType] = useState("on_start_date");
  const [dueRuleValue, setDueRuleValue] = useState<number | string>("");
  const [priorityId, setPriorityId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");

  const availableStages = hiringStages.filter(stage => 
    !templateStages.some(ts => ts.stageId === stage.id)
  );

  const availableTaskDefinitions = taskDefinitions.filter(td => !td.archived);

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
    
    createStageWithTaskMutation.mutate(
      { 
        stageId: selectedStageId, 
        taskDefIds: selectedTaskIds,
        dueRuleType,
        dueRuleValue: dueRuleType === 'on_start_date' ? null : dueRuleValue,
        priorityId: priorityId || null,
        categoryId: categoryId || null,
        assigneeId: assigneeId || null
      },
      { 
        onSuccess: () => {
          onClose();
          setSelectedStageId("");
          setSelectedTaskIds([]);
          setDueRuleType("on_start_date");
          setDueRuleValue("");
          setPriorityId("");
          setCategoryId("");
          setAssigneeId("");
        }
      }
    );
  };

  const isFormValid = selectedStageId && selectedTaskIds.length > 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Stage Selection */}
      <div>
        <label htmlFor="stageSelect" className="block text-sm font-medium mb-2">
          Select Stage to Add *
        </label>
        <Select value={selectedStageId} onValueChange={setSelectedStageId}>
          <SelectTrigger data-testid="select-add-stage">
            <SelectValue placeholder="Choose a hiring stage" />
          </SelectTrigger>
          <SelectContent>
            {availableStages.map((stage) => (
              <SelectItem key={stage.id} value={stage.id}>
                {stage.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Task Selection - Only show if stage is selected */}
      {selectedStageId && (
        <div>
          <label className="block text-sm font-medium mb-2">
            Select Tasks to Add * (at least one required)
          </label>
          <div className="border rounded-md max-h-40 overflow-y-auto p-2 space-y-2">
            {availableTaskDefinitions.map((taskDef) => (
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Due Rule Type</label>
              <Select value={dueRuleType} onValueChange={setDueRuleType}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="on_start_date">On Start Date</SelectItem>
                  <SelectItem value="days_after_start">Days After Start</SelectItem>
                  <SelectItem value="days_before_start">Days Before Start</SelectItem>
                  <SelectItem value="fixed_date">Fixed Date</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {dueRuleType !== 'on_start_date' && (
              <div>
                <label className="block text-xs font-medium mb-1">
                  {dueRuleType === 'fixed_date' ? 'Date' : 'Days'}
                </label>
                {dueRuleType === 'fixed_date' ? (
                  <input
                    type="date"
                    value={dueRuleValue as string}
                    onChange={(e) => setDueRuleValue(e.target.value)}
                    className="w-full h-8 px-2 border rounded text-sm"
                  />
                ) : (
                  <input
                    type="number"
                    value={dueRuleValue as number}
                    onChange={(e) => setDueRuleValue(parseInt(e.target.value))}
                    placeholder="0"
                    className="w-full h-8 px-2 border rounded text-sm"
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
