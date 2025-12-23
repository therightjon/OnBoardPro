/**
 * Template Detail Page
 * Purpose: Dashboard page for viewing/editing a single template, its stages, and tasks with rich client-side orchestration.
 * Belongs: UI composition, data fetching, optimistic UX, and form state for template editing. Domain validation remains server-side.
 * Conventions: Reuse shared hooks/components where possible, avoid duplicating server rules, and keep mutation invalidations centralized.
 */
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
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { ToggleGroup, ToggleGroupItem } from "@/shared/components/ui/toggle-group";
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
import { AutoSelectCombobox } from "@/shared/components/inputs/AutoSelectCombobox";
import { DatePicker, formatDateForApi } from "@/shared/components/inputs/DatePicker";
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
  dueRuleType: z.enum([
    "on_loi_date",
    "days_before_loi",
    "days_after_loi",
    "on_loo_date",
    "days_before_loo",
    "days_after_loo",
    "on_loo_accepted_date",
    "days_before_loo_accepted",
    "days_after_loo_accepted",
    "on_loo_issued_date",
    "days_before_loo_issued",
    "days_after_loo_issued",
    "days_before_start",
    "on_start_date",
    "days_after_start",
    "days_before_stage",
    "days_after_stage",
    "fixed_date"
  ]),
  dueRuleValue: z.number().optional(),
  fixedDate: z.string().optional(),
  defaultAssigneeUserId: z.string().optional(),
  defaultAssigneeKind: z.enum(["user", "role"]).optional(),
  defaultAssigneeRole: z.string().optional(),
  defaultPriorityId: z.string().optional(),
  defaultCategoryId: z.string().optional(),
  isRequired: z.boolean().optional(),
  isPrerequisite: z.boolean().optional(),
  prerequisiteCondition: z.enum(["requires_pt", "always"]).optional(),
}).superRefine((data, ctx) => {
  const loiRules = ["on_loi_date", "days_before_loi", "days_after_loi"];
  const nonLoiRules = ["on_loo_date", "days_before_loo", "days_after_loo", "on_loo_accepted_date", "days_before_loo_accepted", "days_after_loo_accepted", "on_loo_issued_date", "days_before_loo_issued", "days_after_loo_issued", "days_before_start", "on_start_date", "days_after_start", "days_before_stage", "days_after_stage", "fixed_date"];

  // If prerequisite task, must use LOI-based rules
  if (data.isPrerequisite && !loiRules.includes(data.dueRuleType)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Prerequisite tasks must use Letter of Intent (LOI) based due rules",
      path: ["dueRuleType"],
    });
  }

  // If not prerequisite task, cannot use LOI-based rules
  if (!data.isPrerequisite && loiRules.includes(data.dueRuleType)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Regular tasks cannot use LOI-based rules. Please select LOO or Start date rules.",
      path: ["dueRuleType"],
    });
  }

  // If prerequisite is checked, condition is required
  if (data.isPrerequisite && !data.prerequisiteCondition) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Prerequisite condition is required for prerequisite tasks",
      path: ["prerequisiteCondition"],
    });
  }
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
      defaultAssigneeUserId: "none",
      defaultAssigneeKind: 'user' as const,
      defaultAssigneeRole: undefined,
      defaultPriorityId: "none",
      defaultCategoryId: "none",
      isRequired: false,
      isPrerequisite: false,
      prerequisiteCondition: undefined,
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
      defaultAssigneeUserId: "none",
      defaultAssigneeKind: 'user' as const,
      defaultAssigneeRole: undefined,
      defaultPriorityId: "none",
      defaultCategoryId: "none",
      isRequired: false,
      isPrerequisite: false,
      prerequisiteCondition: undefined,
    },
  });

  // Sync due rule type when isPrerequisite changes (for Add Task form)
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name === 'isPrerequisite') {
        // When prerequisite changes, set appropriate default due rule type
        // This happens AFTER React re-renders with new Select options
        if (value.isPrerequisite) {
          const currentDueRule = form.getValues('dueRuleType');
          const loiRules = ['on_loi_date', 'days_before_loi', 'days_after_loi'];
          // Only change if current rule is not LOI-based
          if (!loiRules.includes(currentDueRule)) {
            form.setValue('dueRuleType', 'on_loi_date', { shouldValidate: false });
            form.setValue('prerequisiteCondition', 'requires_pt', { shouldValidate: false });
          }
        } else {
          const currentDueRule = form.getValues('dueRuleType');
          const loiRules = ['on_loi_date', 'days_before_loi', 'days_after_loi'];
          // Only change if current rule is LOI-based (shouldn't be used for non-prerequisite)
          if (loiRules.includes(currentDueRule)) {
            form.setValue('dueRuleType', 'on_loo_date', { shouldValidate: false });
            form.setValue('prerequisiteCondition', undefined, { shouldValidate: false });
          }
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [form]);

  // Sync due rule type when isPrerequisite changes (for Edit Task form)
  useEffect(() => {
    const subscription = editForm.watch((value, { name }) => {
      if (name === 'isPrerequisite') {
        if (value.isPrerequisite) {
          const currentDueRule = editForm.getValues('dueRuleType');
          const loiRules = ['on_loi_date', 'days_before_loi', 'days_after_loi'];
          if (!loiRules.includes(currentDueRule)) {
            editForm.setValue('dueRuleType', 'on_loi_date', { shouldValidate: false });
            editForm.setValue('prerequisiteCondition', 'requires_pt', { shouldValidate: false });
          }
        } else {
          const currentDueRule = editForm.getValues('dueRuleType');
          const loiRules = ['on_loi_date', 'days_before_loi', 'days_after_loi'];
          if (loiRules.includes(currentDueRule)) {
            editForm.setValue('dueRuleType', 'on_loo_date', { shouldValidate: false });
            editForm.setValue('prerequisiteCondition', undefined, { shouldValidate: false });
          }
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [editForm]);

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
        // #WHY backend deletes empty stages alongside the last task; messaging mirrors that side effect.
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
      defaultAssigneeKind?: 'user' | 'role';
      defaultAssigneeUserId?: string | null;
      defaultAssigneeRole?: string | null;
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
      defaultAssigneeUserId: task.defaultAssigneeUserId || "none",
      defaultAssigneeKind: (task.defaultAssigneeKind ?? 'user') as 'user' | 'role',
      defaultAssigneeRole: task.defaultAssigneeRole ?? undefined,
      defaultPriorityId: task.defaultPriorityId || "none",
      defaultCategoryId: task.defaultCategoryId || "none",
      isRequired: !!(task as any).isRequired,
      isPrerequisite: !!(task as any).isPrerequisite,
      prerequisiteCondition: (task as any).prerequisiteCondition,
    });
    setIsEditTaskDialogOpen(true);
  };

  const onSubmit = (data: TemplateTaskForm) => {
    // Convert "none" values back to null for the API
    const processedData = {
      ...data,
      defaultAssigneeKind: 'user' as const,
      defaultAssigneeUserId: data.defaultAssigneeUserId === "none" ? undefined : data.defaultAssigneeUserId,
      defaultAssigneeRole: undefined,
      defaultPriorityId: data.defaultPriorityId === "none" ? undefined : data.defaultPriorityId,
      defaultCategoryId: data.defaultCategoryId === "none" ? undefined : data.defaultCategoryId,
      isRequired: !!data.isRequired,
    };

    // Race-condition guard: prevent adding a task definition already on the template
    if (existingTaskDefIds.has(processedData.taskDefId)) {
      toast({
        title: "Cannot add task",
        description: "This task definition is already in the template.",
        variant: "destructive",
      });
      return;
    }
    createTemplateTaskMutation.mutate(processedData);
  };

  const onEditSubmit = (data: TemplateTaskForm) => {
    if (!selectedTask) return;
    // Convert "none" values and empty strings back to null for the API
    const processedData = {
      ...data,
      id: selectedTask.id,
      defaultAssigneeKind: 'user' as const,
      defaultAssigneeUserId: data.defaultAssigneeUserId === "none" ? undefined : data.defaultAssigneeUserId,
      defaultAssigneeRole: undefined,
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

  // Existing task definition IDs for this template (used to prevent duplicates)
  const existingTaskDefIds = new Set(templateTasks.map(t => t.taskDefId));
  const availableTaskDefinitionsForAdd = taskDefinitions.filter(
    (td) => !td.archived && !existingTaskDefIds.has(td.id)
  );

  // Function to check if a task is the last one in its stage
  const isLastTaskInStage = (task: TemplateTask): boolean => {
    const tasksInSameStage = templateTasks.filter(t => t.stageId === task.stageId);
    return tasksInSameStage.length === 1;
  };

  // Function to handle task deletion with confirmation
  const handleDeleteTask = (task: TemplateTask) => {
    setTaskToDelete(task);
    if (isLastTaskInStage(task)) {
      // #WHY deleting the last task can cascade into stage removal; ask for confirmation first.
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

  const formatPhaseLabel = (phase?: string | null) => {
    if (phase === "onboarding") return "Onboarding";
    return "Pre-hire";
  };

  const getStageName = (stageId: string) => {
    const stage = hiringStages.find(s => s.id === stageId);
    return stage?.name || "Unknown Stage";
  };

  const getStagePhaseLabel = (stageId: string) => {
    const templateStage = templateStages.find(ts => ts.stageId === stageId);
    return templateStage ? formatPhaseLabel(templateStage.phase) : "Unknown Phase";
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
    const value = typeof task.dueRuleValue === "number"
      ? task.dueRuleValue
      : task.dueRuleValue
        ? Number(task.dueRuleValue)
        : 0;

    switch (task.dueRuleType) {
      case "on_loo_date":
        return "On offer letter date";
      case "days_before_loo":
        return `${value} days before offer letter`;
      case "days_after_loo":
        return `${value} days after offer letter`;
      case "days_before_start":
        return `${value} days before start`;
      case "on_start_date":
        return "On start date";
      case "days_after_start":
        return `${value} days after start`;
      case "days_before_stage":
        return `${value} days before stage`;
      case "days_after_stage":
        return `${value} days after stage`;
      case "fixed_date":
        return task.fixedDate ? `Fixed date: ${new Date(task.fixedDate).toLocaleDateString()}` : "Fixed date";
      default:
        const fallbackRule = task.dueRuleType as string | undefined;
        return fallbackRule && fallbackRule.length > 0
          ? fallbackRule.replace(/_/g, " ")
          : "Unknown rule";
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
                templateTasks={templateTasks}
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
                  orderIndex: ts.orderIndex,
                  phase: ts.phase ?? 'pre_hire'
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
                        <FormControl>
                          <AutoSelectCombobox
                            label="Task Definition"
                            value={field.value || ""}
                            onChange={(id) => field.onChange(id || "")}
                            fetchItems={async (q: string) => {
                              const ql = q.trim().toLowerCase()
                              return taskDefinitions
                                .filter(td => !td.archived && !existingTaskDefIds.has(td.id))
                                .filter(td => td.name.toLowerCase().includes(ql))
                                .map(td => ({ id: td.id, name: td.name }))
                            }}
                            placeholder="Search task definitions..."
                            emptyText={availableTaskDefinitionsForAdd.length === 0 
                              ? "All task definitions are already in this template"
                              : "No task definitions found."}
                            data-testid="select-task-definition"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="stageId"
                    render={({ field }: { field: any }) => (
                      <FormItem>
                        <FormControl>
                          <AutoSelectCombobox
                            label="Hiring Stage"
                            value={field.value || ""}
                            onChange={(id) => field.onChange(id || "")}
                            fetchItems={async (q: string) => {
                              const ql = q.trim().toLowerCase();
                              return templateStages
                                .map(ts => {
                                  const stage = hiringStages.find(s => s.id === ts.stageId);
                                  const stageName = stage?.name ?? 'Unknown Stage';
                                  const phaseLabel = (ts.phase ?? 'pre_hire').replace('_', ' ');
                                  return {
                                    id: ts.stageId,
                                    name: `${stageName} (${phaseLabel})`
                                  };
                                })
                                .filter(option => option.name.toLowerCase().includes(ql));
                            }}
                            placeholder="Search stages..."
                            emptyText="No stages available."
                            data-testid="select-stage"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Task Type</label>
                      <p className="text-xs text-muted-foreground">
                        Regular tasks expand when LOO is accepted. Prerequisite tasks expand immediately on candidate creation.
                      </p>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="is-prerequisite"
                          checked={!!form.watch('isPrerequisite')}
                          onCheckedChange={(checked: any) => {
                            // Just toggle the checkbox - useEffect will handle syncing other fields
                            form.setValue('isPrerequisite', !!checked, { shouldValidate: false });
                          }}
                          data-testid="checkbox-is-prerequisite"
                        />
                        <label htmlFor="is-prerequisite" className="text-sm font-medium cursor-pointer">
                          This is a prerequisite task
                        </label>
                      </div>
                    </div>

                    {form.watch('isPrerequisite') && (
                      <FormField
                        control={form.control}
                        name="prerequisiteCondition"
                        render={({ field }: { field: any }) => (
                          <FormItem>
                            <FormLabel>Prerequisite Condition</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-prerequisite-condition">
                                  <SelectValue placeholder="Select condition" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="requires_pt">
                                  <div>
                                    <div className="font-medium">Requires P&T Approval</div>
                                    <div className="text-xs text-muted-foreground">Associate Professor or higher</div>
                                  </div>
                                </SelectItem>
                                <SelectItem value="always">
                                  <div>
                                    <div className="font-medium">Always Apply</div>
                                    <div className="text-xs text-muted-foreground">Create for all candidates</div>
                                  </div>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground mt-1">
                              Task will only be created if this condition is met
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </div>

                  <FormField
                    control={form.control}
                    name="dueRuleType"
                    render={({ field }: { field: any }) => (
                      <FormItem>
                        <FormLabel>Due Rule Type</FormLabel>
                        <Select onValueChange={(value) => {
                          field.onChange(value);
                          const zeroValueRules = ["on_start_date", "on_loo_date", "on_loi_date", "on_loo_accepted_date", "on_loo_issued_date"];
                          const relativeValueRules = [
                            "days_before_start",
                            "days_after_start",
                            "days_before_loi",
                            "days_after_loi",
                            "days_before_loo",
                            "days_after_loo",
                            "days_before_loo_accepted",
                            "days_after_loo_accepted",
                            "days_before_loo_issued",
                            "days_after_loo_issued",
                            "days_before_stage",
                            "days_after_stage"
                          ];

                          if (zeroValueRules.includes(value)) {
                            form.setValue("dueRuleValue", undefined);
                            form.setValue("fixedDate", undefined);
                          } else if (value === "fixed_date") {
                            form.setValue("dueRuleValue", undefined);
                          } else if (relativeValueRules.includes(value)) {
                            form.setValue("fixedDate", undefined);
                          }
                        }} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-due-rule-type">
                              <SelectValue placeholder="Select due rule type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {form.watch('isPrerequisite') ? (
                              // LOI-based rules for prerequisite tasks
                              <>
                                <SelectGroup>
                                  <SelectLabel>Letter of Intent (LOI)</SelectLabel>
                                  <SelectItem value="on_loi_date">On LOI Date</SelectItem>
                                  <SelectItem value="days_before_loi">Days Before LOI</SelectItem>
                                  <SelectItem value="days_after_loi">Days After LOI</SelectItem>
                                </SelectGroup>
                              </>
                            ) : (
                              // Regular rules for normal tasks
                              <>
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
                              </>
                            )}
                          </SelectContent>
                        </Select>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {form.watch('isPrerequisite')
                            ? 'Prerequisite tasks use LOI date as anchor'
                            : 'LOO anchors most pre-hire tasks; Start anchors day-one and beyond.'}
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {form.watch("dueRuleType") && [
                    "days_before_loi",
                    "days_after_loi",
                    "days_before_loo",
                    "days_after_loo",
                    "days_before_loo_accepted",
                    "days_after_loo_accepted",
                    "days_before_loo_issued",
                    "days_after_loo_issued",
                    "days_before_start",
                    "days_after_start",
                    "days_before_stage",
                    "days_after_stage"
                  ].includes(form.watch("dueRuleType")) && (
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
                      name="defaultAssigneeUserId"
                      render={({ field }: { field: any }) => (
                        <FormItem>
                          <FormControl>
                            <AutoSelectCombobox
                              label="Default Assignee (Optional)"
                              value={field.value || "none"}
                              onChange={(id) => field.onChange(id || "none")}
                              fetchItems={async (q: string) => {
                                const ql = q.trim().toLowerCase()
                                const list = users
                                  .map(u => ({ id: u.id, name: `${u.firstName} ${u.lastName}` }))
                                  .filter(u => u.name.toLowerCase().includes(ql))
                                return [{ id: "none", name: "None" }, ...list]
                              }}
                              placeholder="Search assignees..."
                              emptyText="No users available."
                              data-testid="select-default-assignee"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="defaultPriorityId"
                      render={({ field }: { field: any }) => (
                        <FormItem>
                          <FormControl>
                            <AutoSelectCombobox
                              label="Default Priority (Optional)"
                              value={field.value || "none"}
                              onChange={(id) => field.onChange(id || "none")}
                              fetchItems={async (q: string) => {
                                const ql = q.trim().toLowerCase()
                                const list = taskPriorities
                                  .map(p => ({ id: p.id, name: p.name }))
                                  .filter(p => p.name.toLowerCase().includes(ql))
                                return [{ id: "none", name: "None" }, ...list]
                              }}
                              placeholder="Search priorities..."
                              emptyText="No priorities available."
                              data-testid="select-default-priority"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="defaultCategoryId"
                      render={({ field }: { field: any }) => (
                        <FormItem>
                          <FormControl>
                            <AutoSelectCombobox
                              label="Default Category (Optional)"
                              value={field.value || "none"}
                              onChange={(id) => field.onChange(id || "none")}
                              fetchItems={async (q: string) => {
                                const ql = q.trim().toLowerCase()
                                const list = taskCategories
                                  .map(c => ({ id: c.id, name: c.name }))
                                  .filter(c => c.name.toLowerCase().includes(ql))
                                return [{ id: "none", name: "None" }, ...list]
                              }}
                              placeholder="Search categories..."
                              emptyText="No categories available."
                              data-testid="select-default-category"
                            />
                          </FormControl>
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
                    <Button 
                      type="submit" 
                      disabled={createTemplateTaskMutation.isPending || (!!form.watch("taskDefId") && existingTaskDefIds.has(form.watch("taskDefId")))}
                    >
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
                          <FormControl>
                            <AutoSelectCombobox
                              label="Task Definition"
                              value={field.value || ""}
                              onChange={(id) => field.onChange(id || "")}
                              fetchItems={async (q: string) => {
                                const ql = q.trim().toLowerCase()
                                const list = taskDefinitions
                                  .filter(td => !td.archived)
                                  .filter(td => td.name.toLowerCase().includes(ql))
                                  .map(td => ({ id: td.id, name: td.name }))
                                return list
                              }}
                              placeholder="Search task definitions..."
                              emptyText="No task definitions available."
                              data-testid="edit-select-task-definition"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                  <FormField
                    control={editForm.control}
                    name="stageId"
                    render={({ field }: { field: any }) => (
                      <FormItem>
                        <FormControl>
                          <AutoSelectCombobox
                            label="Hiring Stage"
                            value={field.value || ""}
                            onChange={(id) => field.onChange(id || "")}
                            fetchItems={async (q: string) => {
                              const ql = q.trim().toLowerCase();
                              return templateStages
                                .map(ts => {
                                  const stage = hiringStages.find(s => s.id === ts.stageId);
                                  const stageName = stage?.name ?? 'Unknown Stage';
                                  const phaseLabel = (ts.phase ?? 'pre_hire').replace('_', ' ');
                                  return { id: ts.stageId, name: `${stageName} (${phaseLabel})` };
                                })
                                .filter(option => option.name.toLowerCase().includes(ql));
                            }}
                            placeholder="Search stages..."
                            emptyText="No stages available."
                            data-testid="edit-select-stage"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Task Type</label>
                      <p className="text-xs text-muted-foreground">
                        Regular tasks expand when LOO is accepted. Prerequisite tasks expand immediately on candidate creation.
                      </p>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="edit-is-prerequisite"
                          checked={!!editForm.watch('isPrerequisite')}
                          onCheckedChange={(checked: any) => {
                            // Just toggle the checkbox - useEffect will handle syncing other fields
                            editForm.setValue('isPrerequisite', !!checked, { shouldValidate: false });
                          }}
                          data-testid="edit-checkbox-is-prerequisite"
                        />
                        <label htmlFor="edit-is-prerequisite" className="text-sm font-medium cursor-pointer">
                          This is a prerequisite task
                        </label>
                      </div>
                    </div>

                    {editForm.watch('isPrerequisite') && (
                      <FormField
                        control={editForm.control}
                        name="prerequisiteCondition"
                        render={({ field }: { field: any }) => (
                          <FormItem>
                            <FormLabel>Prerequisite Condition</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="edit-select-prerequisite-condition">
                                  <SelectValue placeholder="Select condition" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="requires_pt">
                                  <div>
                                    <div className="font-medium">Requires P&T Approval</div>
                                    <div className="text-xs text-muted-foreground">Associate Professor or higher</div>
                                  </div>
                                </SelectItem>
                                <SelectItem value="always">
                                  <div>
                                    <div className="font-medium">Always Apply</div>
                                    <div className="text-xs text-muted-foreground">Create for all candidates</div>
                                  </div>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground mt-1">
                              Task will only be created if this condition is met
                            </p>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </div>

                  <FormField
                    control={editForm.control}
                    name="dueRuleType"
                    render={({ field }: { field: any }) => (
                      <FormItem>
                        <FormLabel>Due Rule Type</FormLabel>
                        <Select onValueChange={(value) => {
                          field.onChange(value);
                          const zeroValueRules = ["on_start_date", "on_loo_date", "on_loi_date", "on_loo_accepted_date", "on_loo_issued_date"];
                          const relativeValueRules = [
                            "days_before_start",
                            "days_after_start",
                            "days_before_loi",
                            "days_after_loi",
                            "days_before_loo",
                            "days_after_loo",
                            "days_before_loo_accepted",
                            "days_after_loo_accepted",
                            "days_before_loo_issued",
                            "days_after_loo_issued",
                            "days_before_stage",
                            "days_after_stage"
                          ];

                          if (zeroValueRules.includes(value)) {
                            editForm.setValue("dueRuleValue", undefined);
                            editForm.setValue("fixedDate", undefined);
                          } else if (value === "fixed_date") {
                            editForm.setValue("dueRuleValue", undefined);
                          } else if (relativeValueRules.includes(value)) {
                            editForm.setValue("fixedDate", undefined);
                          }
                        }} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="edit-select-due-rule-type">
                              <SelectValue placeholder="Select due rule type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {editForm.watch('isPrerequisite') ? (
                              // LOI-based rules for prerequisite tasks
                              <>
                                <SelectGroup>
                                  <SelectLabel>Letter of Intent (LOI)</SelectLabel>
                                  <SelectItem value="on_loi_date">On LOI Date</SelectItem>
                                  <SelectItem value="days_before_loi">Days Before LOI</SelectItem>
                                  <SelectItem value="days_after_loi">Days After LOI</SelectItem>
                                </SelectGroup>
                              </>
                            ) : (
                              // Regular rules for normal tasks
                              <>
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
                              </>
                            )}
                          </SelectContent>
                        </Select>
                        <p className="mt-2 text-xs text-muted-foreground">
                          {editForm.watch('isPrerequisite')
                            ? 'Prerequisite tasks use LOI date as anchor'
                            : 'LOO anchors most pre-hire tasks; Start anchors day-one and beyond.'}
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {editForm.watch("dueRuleType") && [
                    "days_before_loi",
                    "days_after_loi",
                    "days_before_loo",
                    "days_after_loo",
                    "days_before_loo_accepted",
                    "days_after_loo_accepted",
                    "days_before_loo_issued",
                    "days_after_loo_issued",
                    "days_before_start",
                    "days_after_start",
                    "days_before_stage",
                    "days_after_stage"
                  ].includes(editForm.watch("dueRuleType")) && (
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
                      name="defaultAssigneeUserId"
                      render={({ field }: { field: any }) => (
                        <FormItem>
                          <FormControl>
                            <AutoSelectCombobox
                              label="Default Assignee (Optional)"
                              value={field.value || "none"}
                              onChange={(id) => field.onChange(id || "none")}
                              fetchItems={async (q: string) => {
                                const ql = q.trim().toLowerCase()
                                const list = users
                                  .map(u => ({ id: u.id, name: `${u.firstName} ${u.lastName}` }))
                                  .filter(u => u.name.toLowerCase().includes(ql))
                                return [{ id: "none", name: "None" }, ...list]
                              }}
                              placeholder="Search assignees..."
                              emptyText="No users found."
                              data-testid="edit-select-default-assignee"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={editForm.control}
                      name="defaultPriorityId"
                      render={({ field }: { field: any }) => (
                        <FormItem>
                          <FormControl>
                            <AutoSelectCombobox
                              label="Default Priority (Optional)"
                              value={field.value || "none"}
                              onChange={(id) => field.onChange(id || "none")}
                              fetchItems={async (q: string) => {
                                const ql = q.trim().toLowerCase()
                                const list = taskPriorities
                                  .map(p => ({ id: p.id, name: p.name }))
                                  .filter(p => p.name.toLowerCase().includes(ql))
                                return [{ id: "none", name: "None" }, ...list]
                              }}
                              placeholder="Search priorities..."
                              emptyText="No priorities found."
                              data-testid="edit-select-default-priority"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={editForm.control}
                      name="defaultCategoryId"
                      render={({ field }: { field: any }) => (
                        <FormItem>
                          <FormControl>
                            <AutoSelectCombobox
                              label="Default Category (Optional)"
                              value={field.value || "none"}
                              onChange={(id) => field.onChange(id || "none")}
                              fetchItems={async (q: string) => {
                                const ql = q.trim().toLowerCase()
                                const list = taskCategories
                                  .map(c => ({ id: c.id, name: c.name }))
                                  .filter(c => c.name.toLowerCase().includes(ql))
                                return [{ id: "none", name: "None" }, ...list]
                              }}
                              placeholder="Search categories..."
                              emptyText="No categories found."
                              data-testid="edit-select-default-category"
                            />
                          </FormControl>
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
                <TableHead>Phase</TableHead>
                <TableHead>Due Rule</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Default Assignee</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templateTasks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No tasks configured for this template. Add tasks from the library.
                  </TableCell>
                </TableRow>
              ) : (
                templateTasks.map((task: TemplateTask) => (
                  <TableRow key={task.id} className="hover:bg-muted/50">
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span>{getTaskDefinitionName(task.taskDefId)}</span>
                        {(task as any).isPrerequisite && (
                          <Badge variant="secondary" className="text-xs">
                            ⚡ Prerequisite
                          </Badge>
                        )}
                      </div>
                      {(task as any).isPrerequisite && (task as any).prerequisiteCondition && (
                        <div className="text-xs text-muted-foreground mt-1">
                          Condition: {(task as any).prerequisiteCondition === 'requires_pt' ? 'Requires P&T' : 'Always apply'}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{getStageName(task.stageId)}</TableCell>
                    <TableCell>{getStagePhaseLabel(task.stageId)}</TableCell>
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
                        <span>{getUserName(task.defaultAssigneeUserId)}</span>
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
  const [looDate, setLooDate] = useState<string>("");
  const [loiDate, setLoiDate] = useState<string>("");

  const formatPhaseLabel = (phase?: string | null) => {
    if (phase === 'onboarding') return 'Onboarding';
    return 'Pre-hire';
  };

  const formatNonEstimableReason = (item: any) => {
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
  };

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
                  {estimate.perPhase.map((phase: any) => (
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
              <div className="border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-900/30 rounded-lg p-3">
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
                      <div key={item.taskId ?? index} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                        <span>
                          {taskName}
                          {item.stageName ? (
                            <span className="ml-2 text-xs text-muted-foreground">({item.stageName})</span>
                          ) : null}
                        </span>
                        <span className="text-xs font-medium uppercase tracking-wide text-amber-600 dark:text-amber-300">{anchorLabel}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Non-Estimable Tasks */}
            {otherNonEstimableTasks.length > 0 && (
              <div>
                <h4 className="font-medium mb-2 text-amber-700 dark:text-amber-400">
                  Tasks Not Included in Estimate
                </h4>
                <div className="text-sm text-muted-foreground space-y-1">
                  {otherNonEstimableTasks.map((item: any, index: number) => {
                    // item.taskId is a template task ID, need to find the task definition ID
                    const templateTask = templateTasks.find(tt => tt.id === item.taskId);
                    const fallbackName = item.taskId ? `Task ${String(item.taskId).slice(0, 8)}...` : `Task ${index + 1}`;
                    const taskName = templateTask ? getTaskDefinitionName(templateTask.taskDefId) : fallbackName;
                    const reasonText = formatNonEstimableReason(item);
                    return (
                      <div key={item.taskId ?? index} className="flex justify-between">
                        <span>
                          {taskName}
                          {item.stageName ? (
                            <span className="ml-2 text-xs text-muted-foreground">({item.stageName})</span>
                          ) : null}
                        </span>
                        <span className="italic text-right">{reasonText}</span>
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
  templateTasks: TemplateTask[];
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
  templateTasks,
  taskDefinitions,
  taskPriorities,
  taskCategories,
  users,
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

  // Exclude task definitions that are already added to this template
  const existingTaskDefIds = new Set(templateTasks.map(t => t.taskDefId));
  const availableTaskDefinitions = taskDefinitions.filter(td => !td.archived && !existingTaskDefIds.has(td.id));
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

    // Race-condition guard: exclude tasks that have been added since dialog opened
    const existingIds = new Set(templateTasks.map(t => t.taskDefId));
    const uniqueTaskIds = selectedTaskIds.filter(id => !existingIds.has(id));

    if (uniqueTaskIds.length === 0) {
      toast({
        title: "Nothing to add",
        description: "All selected tasks are already in this template.",
        variant: "destructive",
      });
      return;
    }

    if (uniqueTaskIds.length !== selectedTaskIds.length) {
      const removed = selectedTaskIds.length - uniqueTaskIds.length;
      toast({
        title: "Some tasks skipped",
        description: `${removed} already-added task(s) were excluded.`,
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
  const isFormValid = selectedStageId && selectedTaskIds.some(id => !existingTaskDefIds.has(id)) && hasValidDueRuleValue;

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
          <div className="grid grid-cols-2 gap-4">
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
                    value={(dueRuleValue as number) ?? 0}
                    onChange={(e) => setDueRuleValue(parseInt(e.target.value) || 0)}
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
