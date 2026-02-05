/**
 * TemplateTaskFormDialog Component
 * 
 * Unified dialog for adding or editing template tasks.
 * Handles form state, validation, and submission for both modes.
 */
import { useEffect } from "react";
import { UseFormReturn, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/shared/components/ui/form";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { AutoSelectCombobox } from "@/shared/components/inputs/AutoSelectCombobox";
import type { 
  TemplateTask,
  TemplateStage,
  TaskDefinition, 
  HiringStage, 
  User as UserType,
  TaskPriority,
  TaskCategory
} from "@shared/schemas";

// Validation schema for template task form
export const templateTaskSchema = z.object({
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
  prerequisiteCondition: z.enum(["requires_pt", "always"]).nullable().optional(),
}).superRefine((data, ctx) => {
  const loiRules = ["on_loi_date", "days_before_loi", "days_after_loi"];

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

export type TemplateTaskFormValues = z.infer<typeof templateTaskSchema>;

interface TemplateTaskFormDialogProps {
  mode: "add" | "edit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: TemplateTaskFormValues) => void;
  isPending: boolean;
  // Data for populating dropdowns
  taskDefinitions: TaskDefinition[];
  templateStages: TemplateStage[];
  hiringStages: HiringStage[];
  users: UserType[];
  taskPriorities: TaskPriority[];
  taskCategories: TaskCategory[];
  // For add mode - exclude already-added task definitions
  existingTaskDefIds?: Set<string>;
  // For edit mode - the task being edited
  selectedTask?: TemplateTask | null;
  // Pre-selected stage when adding from a specific stage
  preSelectedStageId?: string;
}

export function TemplateTaskFormDialog({
  mode,
  open,
  onOpenChange,
  onSubmit,
  isPending,
  taskDefinitions,
  templateStages,
  hiringStages,
  users,
  taskPriorities,
  taskCategories,
  existingTaskDefIds = new Set(),
  selectedTask,
  preSelectedStageId
}: TemplateTaskFormDialogProps) {
  const isEdit = mode === "edit";
  const testIdPrefix = isEdit ? "edit-" : "";

  const form = useForm<TemplateTaskFormValues>({
    resolver: zodResolver(templateTaskSchema),
    defaultValues: {
      taskDefId: "",
      stageId: preSelectedStageId || "",
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

  // Reset form when dialog opens/closes or when editing a different task
  useEffect(() => {
    if (open) {
      if (isEdit && selectedTask) {
        form.reset({
          taskDefId: selectedTask.taskDefId,
          stageId: selectedTask.stageId,
          dueRuleType: selectedTask.dueRuleType,
          dueRuleValue: selectedTask.dueRuleValue || 0,
          fixedDate: selectedTask.fixedDate || "",
          defaultAssigneeUserId: selectedTask.defaultAssigneeUserId || "none",
          defaultAssigneeKind: (selectedTask.defaultAssigneeKind ?? 'user') as 'user' | 'role',
          defaultAssigneeRole: selectedTask.defaultAssigneeRole ?? undefined,
          defaultPriorityId: selectedTask.defaultPriorityId || "none",
          defaultCategoryId: selectedTask.defaultCategoryId || "none",
          isRequired: !!(selectedTask as any).isRequired,
          isPrerequisite: !!(selectedTask as any).isPrerequisite,
          prerequisiteCondition: (selectedTask as any).prerequisiteCondition,
        });
      } else {
        form.reset({
          taskDefId: "",
          stageId: preSelectedStageId || "",
          dueRuleType: "on_start_date",
          dueRuleValue: undefined,
          fixedDate: undefined,
          defaultAssigneeUserId: undefined,
          defaultAssigneeKind: "user",
          defaultAssigneeRole: undefined,
          defaultPriorityId: undefined,
          defaultCategoryId: undefined,
          isRequired: true,
          isPrerequisite: false,
          prerequisiteCondition: undefined,
        });
      }
    }
  }, [open, isEdit, selectedTask, preSelectedStageId, form]);

  // Sync due rule type when isPrerequisite changes
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name === 'isPrerequisite') {
        const loiRules = ['on_loi_date', 'days_before_loi', 'days_after_loi'];
        if (value.isPrerequisite) {
          const currentDueRule = form.getValues('dueRuleType');
          if (!loiRules.includes(currentDueRule)) {
            form.setValue('dueRuleType', 'on_loi_date', { shouldValidate: false });
            form.setValue('prerequisiteCondition', 'requires_pt', { shouldValidate: false });
          }
        } else {
          const currentDueRule = form.getValues('dueRuleType');
          if (loiRules.includes(currentDueRule)) {
            form.setValue('dueRuleType', 'on_loo_date', { shouldValidate: false });
            form.setValue('prerequisiteCondition', undefined, { shouldValidate: false });
          }
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [form]);

  const handleDueRuleTypeChange = (value: string) => {
    form.setValue("dueRuleType", value as any);
    const zeroValueRules = ["on_start_date", "on_loo_date", "on_loi_date", "on_loo_accepted_date", "on_loo_issued_date"];
    const relativeValueRules = [
      "days_before_start", "days_after_start",
      "days_before_loi", "days_after_loi",
      "days_before_loo", "days_after_loo",
      "days_before_loo_accepted", "days_after_loo_accepted",
      "days_before_loo_issued", "days_after_loo_issued",
      "days_before_stage", "days_after_stage"
    ];

    if (zeroValueRules.includes(value)) {
      form.setValue("dueRuleValue", undefined);
      form.setValue("fixedDate", undefined);
    } else if (value === "fixed_date") {
      form.setValue("dueRuleValue", undefined);
    } else if (relativeValueRules.includes(value)) {
      form.setValue("dueRuleValue", form.getValues("dueRuleValue") ?? 0, { shouldValidate: false });
      form.setValue("fixedDate", undefined);
    }
  };

  const availableTaskDefinitionsForAdd = taskDefinitions.filter(
    (td) => !td.archived && !existingTaskDefIds.has(td.id)
  );

  const showDaysInput = form.watch("dueRuleType") && [
    "days_before_loi", "days_after_loi",
    "days_before_loo", "days_after_loo",
    "days_before_loo_accepted", "days_after_loo_accepted",
    "days_before_loo_issued", "days_after_loo_issued",
    "days_before_start", "days_after_start",
    "days_before_stage", "days_after_stage"
  ].includes(form.watch("dueRuleType"));

  const handleFormSubmit = (data: TemplateTaskFormValues) => {
    // Convert "none" values back to undefined for the API
    const processedData = {
      ...data,
      defaultAssigneeKind: 'user' as const,
      defaultAssigneeUserId: data.defaultAssigneeUserId === "none" ? undefined : data.defaultAssigneeUserId,
      defaultAssigneeRole: undefined,
      defaultPriorityId: data.defaultPriorityId === "none" ? undefined : data.defaultPriorityId,
      defaultCategoryId: data.defaultCategoryId === "none" ? undefined : data.defaultCategoryId,
      fixedDate: data.fixedDate === "" ? undefined : data.fixedDate,
      dueRuleValue: data.dueRuleType === "fixed_date" ? undefined : data.dueRuleValue,
      isRequired: !!data.isRequired,
      prerequisiteCondition: data.isPrerequisite ? data.prerequisiteCondition : undefined,
    };
    onSubmit(processedData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full sm:max-w-2xl max-h-[90vh] sm:max-h-min overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Template Task" : "Add Task to Template"}</DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit 
              ? "Update the task definition, assignment, priority, and due date settings."
              : "Select a task definition and configure settings to add to this template."
            }
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="taskDefId"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <AutoSelectCombobox
                      label="Task Definition"
                      value={field.value || ""}
                      onChange={(id) => field.onChange(id || "")}
                      fetchItems={async (q: string) => {
                        const ql = q.trim().toLowerCase();
                        const list = isEdit 
                          ? taskDefinitions.filter(td => !td.archived)
                          : availableTaskDefinitionsForAdd;
                        return list
                          .filter(td => td.name.toLowerCase().includes(ql))
                          .map(td => ({ id: td.id, name: td.name }));
                      }}
                      placeholder="Search task definitions..."
                      emptyText={availableTaskDefinitionsForAdd.length === 0 && !isEdit
                        ? "All task definitions are already in this template"
                        : "No task definitions found."}
                      data-testid={`${testIdPrefix}select-task-definition`}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="stageId"
              render={({ field }) => (
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
                      data-testid={`${testIdPrefix}select-stage`}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Task Type Section */}
            <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
              <div className="space-y-2">
                <label className="text-sm font-medium">Task Type</label>
                <p className="text-xs text-muted-foreground">
                  Regular tasks expand when LOO is accepted. Prerequisite tasks expand immediately on candidate creation.
                </p>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id={`${testIdPrefix}is-prerequisite`}
                    checked={!!form.watch('isPrerequisite')}
                    onCheckedChange={(checked) => {
                      form.setValue('isPrerequisite', !!checked, { shouldValidate: false });
                    }}
                    data-testid={`${testIdPrefix}checkbox-is-prerequisite`}
                  />
                  <label htmlFor={`${testIdPrefix}is-prerequisite`} className="text-sm font-medium cursor-pointer">
                    This is a prerequisite task
                  </label>
                </div>
              </div>

              {form.watch('isPrerequisite') && (
                <FormField
                  control={form.control}
                  name="prerequisiteCondition"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Prerequisite Condition</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? undefined}>
                        <FormControl>
                          <SelectTrigger data-testid={`${testIdPrefix}select-prerequisite-condition`}>
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

            {/* Due Rule Type */}
            <FormField
              control={form.control}
              name="dueRuleType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Due Rule Type</FormLabel>
                  <Select onValueChange={handleDueRuleTypeChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid={`${testIdPrefix}select-due-rule-type`}>
                        <SelectValue placeholder="Select due rule type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {form.watch('isPrerequisite') ? (
                        <SelectGroup>
                          <SelectLabel>Letter of Intent (LOI)</SelectLabel>
                          <SelectItem value="on_loi_date">On LOI Date</SelectItem>
                          <SelectItem value="days_before_loi">Days Before LOI</SelectItem>
                          <SelectItem value="days_after_loi">Days After LOI</SelectItem>
                        </SelectGroup>
                      ) : (
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

            {/* Days Input */}
            {showDaysInput && (
              <FormField
                control={form.control}
                name="dueRuleValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Days</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="Enter number of days"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                        data-testid={`${testIdPrefix}input-due-rule-value`}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Fixed Date Input */}
            {form.watch("dueRuleType") === "fixed_date" && (
              <FormField
                control={form.control}
                name="fixedDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fixed Date</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        data-testid={`${testIdPrefix}input-fixed-date`}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Optional Fields Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="defaultAssigneeUserId"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <AutoSelectCombobox
                        label="Default Assignee (Optional)"
                        value={field.value || "none"}
                        onChange={(id) => field.onChange(id || "none")}
                        fetchItems={async (q: string) => {
                          const ql = q.trim().toLowerCase();
                          const list = users
                            .map(u => ({ id: u.id, name: `${u.firstName} ${u.lastName}` }))
                            .filter(u => u.name.toLowerCase().includes(ql));
                          return [{ id: "none", name: "None" }, ...list];
                        }}
                        placeholder="Search assignees..."
                        emptyText="No users available."
                        data-testid={`${testIdPrefix}select-default-assignee`}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="defaultPriorityId"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <AutoSelectCombobox
                        label="Default Priority (Optional)"
                        value={field.value || "none"}
                        onChange={(id) => field.onChange(id || "none")}
                        fetchItems={async (q: string) => {
                          const ql = q.trim().toLowerCase();
                          const list = taskPriorities
                            .map(p => ({ id: p.id, name: p.name }))
                            .filter(p => p.name.toLowerCase().includes(ql));
                          return [{ id: "none", name: "None" }, ...list];
                        }}
                        placeholder="Search priorities..."
                        emptyText="No priorities available."
                        data-testid={`${testIdPrefix}select-default-priority`}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="defaultCategoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <AutoSelectCombobox
                        label="Default Category (Optional)"
                        value={field.value || "none"}
                        onChange={(id) => field.onChange(id || "none")}
                        fetchItems={async (q: string) => {
                          const ql = q.trim().toLowerCase();
                          const list = taskCategories
                            .map(c => ({ id: c.id, name: c.name }))
                            .filter(c => c.name.toLowerCase().includes(ql));
                          return [{ id: "none", name: "None" }, ...list];
                        }}
                        placeholder="Search categories..."
                        emptyText="No categories available."
                        data-testid={`${testIdPrefix}select-default-category`}
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
                <Checkbox 
                  id={`${testIdPrefix}is-required`} 
                  checked={!!form.watch('isRequired')} 
                  onCheckedChange={(v) => form.setValue('isRequired', !!v)} 
                />
                <label htmlFor={`${testIdPrefix}is-required`} className="text-sm">Task is required</label>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isPending || (!isEdit && !!form.watch("taskDefId") && existingTaskDefIds.has(form.watch("taskDefId")))}
              >
                {isPending ? (isEdit ? "Saving..." : "Adding...") : (isEdit ? "Save" : "Add Task")}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
