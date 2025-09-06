import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Edit, Archive, BookOpen, Filter } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { TaskDefinition } from "@shared/schema";
import { RouteGuard } from "@/components/route-guard";

const taskDefinitionSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});

type TaskDefinitionForm = z.infer<typeof taskDefinitionSchema>;

export default function TasksPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [archiveFilter, setArchiveFilter] = useState<string>("all");
  const [isNewTaskDefDialogOpen, setIsNewTaskDefDialogOpen] = useState(false);
  const [editingTaskDef, setEditingTaskDef] = useState<TaskDefinition | null>(null);
  const { toast } = useToast();

  const { data: taskDefinitions = [], isLoading } = useQuery<TaskDefinition[]>({
    queryKey: ["/api/task-definitions"],
  });

  const form = useForm<TaskDefinitionForm>({
    resolver: zodResolver(taskDefinitionSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  const createTaskDefMutation = useMutation({
    mutationFn: async (data: TaskDefinitionForm) => {
      const res = await apiRequest("POST", "/api/task-definitions", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-definitions"] });
      setIsNewTaskDefDialogOpen(false);
      form.reset();
      toast({
        title: "Success",
        description: "Task definition created successfully",
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

  const updateTaskDefMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<TaskDefinition> }) => {
      const res = await apiRequest("PATCH", `/api/task-definitions/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-definitions"] });
      setEditingTaskDef(null);
      toast({
        title: "Success",
        description: "Task definition updated successfully",
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

  const filteredTaskDefinitions = taskDefinitions.filter((taskDef: TaskDefinition) => {
    if (!taskDef) return false;
    
    // Apply archive filter
    if (archiveFilter === "active" && taskDef.archived) return false;
    if (archiveFilter === "archived" && !taskDef.archived) return false;
    
    // Apply search filter
    return taskDef.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
           (taskDef.description && taskDef.description.toLowerCase().includes(searchTerm.toLowerCase()));
  });

  const archiveTaskDefMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/task-definitions/${id}`, { archived: true });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-definitions"] });
      toast({
        title: "Success",
        description: "Task definition archived successfully",
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

  const handleEdit = (taskDef: TaskDefinition) => {
    setEditingTaskDef(taskDef);
  };

  const handleUpdate = (data: { name: string; description?: string; archived?: boolean }) => {
    if (!editingTaskDef) return;
    updateTaskDefMutation.mutate({
      id: editingTaskDef.id,
      data
    });
  };

  const onSubmit = (data: TaskDefinitionForm) => {
    createTaskDefMutation.mutate(data);
  };


  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="h-32 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <RouteGuard allowedRoles={["system_admin", "hr_staff"]}>
      <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" data-testid="text-tasks-title">Task Definitions</h1>
          <p className="text-muted-foreground">Manage library of reusable task definitions</p>
        </div>
        <Dialog open={isNewTaskDefDialogOpen} onOpenChange={setIsNewTaskDefDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-task-definition">
              <Plus className="w-4 h-4 mr-2" />
              New Task
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-[95vw] w-full sm:max-w-2xl max-h-[90vh] sm:max-h-min overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Task</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter task definition name"
                          {...field}
                          data-testid="input-task-def-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Enter task definition description"
                          {...field}
                          data-testid="textarea-task-def-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={() => setIsNewTaskDefDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createTaskDefMutation.isPending}>
                    {createTaskDefMutation.isPending ? "Creating..." : "Create New Task"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Filter className="w-4 h-4 mr-2" />
            Search & Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search task definitions..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-task-definitions"
                />
              </div>
            </div>
            <Select value={archiveFilter} onValueChange={setArchiveFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-archive-filter">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Definitions</SelectItem>
                <SelectItem value="active">Active Only</SelectItem>
                <SelectItem value="archived">Archived Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Task Definitions Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <BookOpen className="w-4 h-4 mr-2" />
            Task Library
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-full">
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[120px]" data-testid="header-name">Name</TableHead>
                <TableHead className="min-w-[200px] max-w-[300px]" data-testid="header-description">Description</TableHead>
                <TableHead className="min-w-[80px] hidden sm:table-cell" data-testid="header-status">Status</TableHead>
                <TableHead className="min-w-[100px] hidden md:table-cell" data-testid="header-created">Created</TableHead>
                <TableHead className="min-w-[100px] w-[100px]" data-testid="header-actions">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTaskDefinitions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    {taskDefinitions.length === 0 
                      ? "No task definitions found. Create your first task definition to get started." 
                      : "No task definitions found matching your search criteria"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredTaskDefinitions.map((taskDef: TaskDefinition) => (
                  <TableRow key={taskDef.id} className="hover:bg-muted/50" data-testid={`row-task-def-${taskDef.id}`}>
                    <TableCell className="font-medium p-2 xs:p-3 sm:p-4">
                      <div className="break-words">{taskDef.name}</div>
                    </TableCell>
                    <TableCell className="p-2 xs:p-3 sm:p-4">
                      <div className="break-words text-sm leading-relaxed">{taskDef.description || "-"}</div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell p-2 xs:p-3 sm:p-4">
                      <Badge variant={taskDef.archived ? "secondary" : "default"}>
                        {taskDef.archived ? "Archived" : "Active"}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell p-2 xs:p-3 sm:p-4">
                      <div className="text-sm">{new Date(taskDef.createdAt).toLocaleDateString()}</div>
                    </TableCell>
                    <TableCell className="p-2 xs:p-3 sm:p-4">
                      <div className="flex items-center gap-1 xs:gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="min-h-[44px] min-w-[44px] p-2"
                          onClick={() => handleEdit(taskDef)}
                          data-testid={`button-edit-task-def-${taskDef.id}`}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="min-h-[44px] min-w-[44px] p-2"
                          onClick={() => archiveTaskDefMutation.mutate(taskDef.id)}
                          data-testid={`button-archive-task-def-${taskDef.id}`}
                        >
                          <Archive className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      {editingTaskDef && (
        <Dialog open={!!editingTaskDef} onOpenChange={(open) => !open && setEditingTaskDef(null)}>
          <DialogContent className="max-w-[95vw] w-full sm:max-w-2xl max-h-[90vh] sm:max-h-min overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Task Definition</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Name</label>
                <Input
                  defaultValue={editingTaskDef.name}
                  onChange={(e) => setEditingTaskDef({ ...editingTaskDef, name: e.target.value })}
                  data-testid="input-edit-task-def-name"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Description</label>
                <Textarea
                  defaultValue={editingTaskDef.description || ""}
                  onChange={(e) => setEditingTaskDef({ ...editingTaskDef, description: e.target.value })}
                  data-testid="textarea-edit-task-def-description"
                />
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="archived"
                  checked={editingTaskDef.archived}
                  onCheckedChange={(checked) => setEditingTaskDef({ ...editingTaskDef, archived: checked })}
                  data-testid="switch-archive-task-def"
                />
                <label htmlFor="archived" className="text-sm font-medium">
                  Archive this task definition
                </label>
              </div>
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setEditingTaskDef(null)}>
                  Cancel
                </Button>
                <Button 
                  onClick={() => handleUpdate({ 
                    name: editingTaskDef.name, 
                    description: editingTaskDef.description || undefined,
                    archived: editingTaskDef.archived
                  })}
                  disabled={updateTaskDefMutation.isPending}
                >
                  {updateTaskDefMutation.isPending ? "Updating..." : "Update"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
      </div>
    </RouteGuard>
  );
}
