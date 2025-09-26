import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/shared/components/ui/form";
import { CalendarIcon } from "lucide-react";
import { Calendar } from "@/shared/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { insertCandidateTaskSchema, type InsertCandidateTask, type Candidate, type HiringStage, type TaskCategory, type User, type TaskDefinition } from "@shared/schemas";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/shared/hooks/use-toast";

interface NewTaskFormProps {
  candidateId?: string;
  onSuccess?: () => void;
}

export function NewTaskForm({ candidateId, onSuccess }: NewTaskFormProps) {
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState<Date>();
  const [selectedTaskDef, setSelectedTaskDef] = useState<TaskDefinition | null>(null);
  const [saveAsDefinition, setSaveAsDefinition] = useState(false);

  const form = useForm<InsertCandidateTask>({
    resolver: zodResolver(insertCandidateTaskSchema.extend({
      dueAt: insertCandidateTaskSchema.shape.dueAt.optional()
    })),
    defaultValues: {
      candidateId: candidateId || "",
      title: "",
      description: "",
      priority: "medium",
      status: "todo",
      required: true,
      taskDefId: undefined
    }
  });

  // Fetch reference data
  const { data: candidates = [] } = useQuery<Candidate[]>({
    queryKey: ["/api/candidates"]
  });

  const { data: hiringStages = [] } = useQuery<HiringStage[]>({
    queryKey: ["/api/hiring-stages"]
  });

  const { data: taskCategories = [] } = useQuery<TaskCategory[]>({
    queryKey: ["/api/task-categories"]
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users/assignable"]
  });

  const { data: taskDefinitions = [] } = useQuery<TaskDefinition[]>({
    queryKey: ["/api/task-definitions"]
  });

  const createTaskMutation = useMutation({
    mutationFn: async (data: InsertCandidateTask) => {
      const res = await apiRequest("POST", "/api/tasks", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/mine"] });
      toast({
        title: "Success",
        description: "Task created successfully"
      });
      form.reset();
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const onSubmit = (data: InsertCandidateTask) => {
    if (!data.candidateId) {
      toast({
        title: "Error",
        description: "Please select a candidate",
        variant: "destructive"
      });
      return;
    }
    
    const taskData: any = {
      ...data,
      dueAt: selectedDate || null,
      save_as_definition: saveAsDefinition && !data.taskDefId
    };
    taskData.assigneeKind = 'user';
    taskData.assigneeRole = null;
    if (!taskData.assigneeUserId) {
      taskData.assigneeUserId = null;
    }
    createTaskMutation.mutate(taskData);
  };

  const handleTaskDefSelection = (taskDefId: string) => {
    const taskDef = taskDefinitions.find(td => td.id === taskDefId);
    if (taskDef) {
      setSelectedTaskDef(taskDef);
      form.setValue("taskDefId", taskDefId);
      form.setValue("title", taskDef.name);
      form.setValue("description", taskDef.description || "");
    } else {
      setSelectedTaskDef(null);
      form.setValue("taskDefId", undefined);
      form.setValue("title", "");
      form.setValue("description", "");
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Candidate Selector - REQUIRED */}
          <FormField
            control={form.control}
            name="candidateId"
            render={({ field }: { field: any }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Candidate <span className="text-red-500">*</span></FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-candidate">
                      <SelectValue placeholder="Select a candidate (required)" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {candidates.length === 0 ? (
                      <SelectItem disabled value="__no_candidates__">No candidates available.</SelectItem>
                    ) : (
                      candidates.map((candidate: Candidate) => (
                        <SelectItem key={candidate.id} value={candidate.id}>
                          {candidate.firstName} {candidate.lastName} - {candidate.email}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Task Definition Selector */}
          <FormField
            control={form.control}
            name="taskDefId"
            render={({ field }: { field: any }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Task Definition (Optional)</FormLabel>
                <Select onValueChange={handleTaskDefSelection} value={field.value || ""}>
                  <FormControl>
                    <SelectTrigger data-testid="select-task-definition">
                      <SelectValue placeholder="Select from library or create custom task" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="custom">Create Custom Task</SelectItem>
                    {taskDefinitions.filter(td => !td.archived).length === 0 ? (
                      <SelectItem disabled value="__no_taskdefs__">No task definitions available.</SelectItem>
                    ) : (
                      taskDefinitions.filter(td => !td.archived).map((taskDef: TaskDefinition) => (
                        <SelectItem key={taskDef.id} value={taskDef.id}>
                          {taskDef.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Title */}
          <FormField
            control={form.control}
            name="title"
            render={({ field }: { field: any }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Task Title</FormLabel>
                <FormControl>
                  <Input 
                    placeholder="Enter task title"
                    data-testid="input-task-title"
                    {...field} 
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Description */}
          <FormField
            control={form.control}
            name="description"
            render={({ field }: { field: any }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea 
                    placeholder="Enter task description (optional)"
                    className="min-h-[80px]"
                    data-testid="textarea-task-description"
                    {...field}
                    value={field.value || ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Candidate */}
          <FormField
            control={form.control}
            name="candidateId"
            render={({ field }: { field: any }) => (
              <FormItem>
                <FormLabel>Candidate</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-candidate">
                      <SelectValue placeholder="Select candidate" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {candidates.length === 0 ? (
                      <SelectItem disabled value="__no_candidates__">No candidates available.</SelectItem>
                    ) : (
                      candidates.map((candidate: any) => (
                        <SelectItem key={candidate.id} value={candidate.id}>
                          {candidate.firstName} {candidate.lastName}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Hiring Stage */}
          <FormField
            control={form.control}
            name="stageId"
            render={({ field }: { field: any }) => (
              <FormItem>
                <FormLabel>Hiring Stage</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-stage">
                      <SelectValue placeholder="Select stage" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {hiringStages.length === 0 ? (
                      <SelectItem disabled value="__no_stages__">No stages available.</SelectItem>
                    ) : (
                      hiringStages.map((stage: any) => (
                        <SelectItem key={stage.id} value={stage.id}>
                          {stage.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Priority */}
          <FormField
            control={form.control}
            name="priority"
            render={({ field }: { field: any }) => (
              <FormItem>
                <FormLabel>Priority</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-priority">
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Category */}
          <FormField
            control={form.control}
            name="categoryId"
            render={({ field }: { field: any }) => (
              <FormItem>
                <FormLabel>Category</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-category">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {taskCategories.length === 0 ? (
                      <SelectItem disabled value="__no_categories__">No categories available.</SelectItem>
                    ) : (
                      taskCategories.map((category: any) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Assignee */}
          <FormField
            control={form.control}
            name="assigneeUserId"
            render={({ field }: { field: any }) => (
              <FormItem>
                <FormLabel>Assignee (Optional)</FormLabel>
                <Select
                  onValueChange={(value) => field.onChange(value === "none" ? null : value)}
                  value={field.value ?? "none"}
                >
                  <FormControl>
                    <SelectTrigger data-testid="select-assignee">
                      <SelectValue placeholder="Select assignee (optional)" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="none">No assignee</SelectItem>
                    {users.length === 0 ? (
                      <SelectItem disabled value="__no_users__">No assignees available.</SelectItem>
                    ) : (
                      users.map((user: any) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.firstName} {user.lastName} ({user.email})
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Due Date */}
          <FormField
            control={form.control}
            name="dueAt"
            render={({ field }: { field: any }) => (
              <FormItem>
                <FormLabel>Due Date (Optional)</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full pl-3 text-left font-normal",
                          !selectedDate && "text-muted-foreground"
                        )}
                        data-testid="button-select-due-date"
                      >
                        {selectedDate ? (
                          format(selectedDate, "PPP")
                        ) : (
                          <span>Pick a due date</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      disabled={(date: Date) => date < new Date()}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Submit Button */}
        <div className="flex justify-end space-x-2">
          <Button 
            type="submit" 
            disabled={createTaskMutation.isPending}
            data-testid="button-create-task"
          >
            {createTaskMutation.isPending ? "Creating..." : "Create Task"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
