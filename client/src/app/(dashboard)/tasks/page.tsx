import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/shared/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/shared/components/ui/form";
import { Textarea } from "@/shared/components/ui/textarea";
import { Switch } from "@/shared/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Plus, Search, Edit, Archive, RotateCcw, BookOpen, Filter } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/shared/hooks/use-toast";
import { useSortableTable } from "@/shared/hooks/use-sortable-table";
import { SortableTableHeader } from "@/shared/components/sortable-table-header";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { insertTaskDefinitionSchema, type TaskDefinition } from "@shared/schemas";
import { RouteGuard } from "@/shared/components/route-guard";
import { PaginationControls } from "@/shared/components/pagination-controls";

const PAGE_SIZE = 5;

type TaskDefSortKey = "name" | "status" | "createdAt";

const taskDefinitionSchema = insertTaskDefinitionSchema.pick({
  name: true,
  description: true,
});

type TaskDefinitionForm = z.infer<typeof taskDefinitionSchema>;

export default function TasksPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [archiveFilter, setArchiveFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [isNewTaskDefDialogOpen, setIsNewTaskDefDialogOpen] = useState(false);
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const [isRestoreDialogOpen, setIsRestoreDialogOpen] = useState(false);
  const [archivingTaskDef, setArchivingTaskDef] = useState<TaskDefinition | null>(null);
  const [restoringTaskDef, setRestoringTaskDef] = useState<TaskDefinition | null>(null);
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

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, archiveFilter]);

  const filteredTaskDefinitions = useMemo(() => {
    return taskDefinitions.filter((taskDef: TaskDefinition) => {
      if (!taskDef) return false;
      
      if (archiveFilter === "active" && taskDef.archived) return false;
      if (archiveFilter === "archived" && !taskDef.archived) return false;
      
      return taskDef.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
             (taskDef.description && taskDef.description.toLowerCase().includes(searchTerm.toLowerCase()));
    });
  }, [taskDefinitions, archiveFilter, searchTerm]);

  const sortableColumns = useMemo<Record<TaskDefSortKey, { getValue?: (row: TaskDefinition) => string | number | boolean | Date | null | undefined }>>(
    () => ({
      name: {
        getValue: (taskDef: TaskDefinition) => taskDef.name || "",
      },
      status: {
        getValue: (taskDef: TaskDefinition) => (taskDef.archived ? 0 : 1),
      },
      createdAt: {
        getValue: (taskDef: TaskDefinition) => taskDef.createdAt ? new Date(taskDef.createdAt) : null,
      },
    }),
    []
  );

  const { sortedRows: sortedTaskDefinitions, sortState, toggleSort } = useSortableTable<TaskDefinition, TaskDefSortKey>({
    rows: filteredTaskDefinitions,
    columns: sortableColumns,
  });

  const pageSize = PAGE_SIZE;
  const totalTaskDefinitions = sortedTaskDefinitions.length;
  const totalPages = totalTaskDefinitions > 0 ? Math.ceil(totalTaskDefinitions / pageSize) : 1;
  const paginatedTaskDefinitions = sortedTaskDefinitions.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  useEffect(() => {
    setCurrentPage(1);
  }, [sortState]);

  const archiveTaskDefMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/task-definitions/${id}`, { archived: true });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-definitions"] });
      setIsArchiveDialogOpen(false);
      setArchivingTaskDef(null);
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

  const restoreTaskDefMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/task-definitions/${id}`, { archived: false });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/task-definitions"] });
      setIsRestoreDialogOpen(false);
      setRestoringTaskDef(null);
      toast({
        title: "Success",
        description: "Task definition restored successfully",
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
      <div className="p-4 sm:p-6 space-y-4 xs:space-y-5 sm:space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 xs:h-8 bg-muted rounded w-1/4"></div>
          <div className="h-24 xs:h-32 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <RouteGuard allowedRoles={["system_admin", "hr_staff"]}>
      <div className="p-4 sm:p-6 space-y-4 xs:space-y-5 sm:space-y-6">
      {/* Page Header */}
      <div className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-3 xs:gap-4">
        <div className="min-w-0">
          <h1 className="text-lg xs:text-xl sm:text-2xl font-bold text-foreground" data-testid="text-tasks-title">Task Library</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Manage library of reusable task definitions</p>
        </div>
        <Dialog open={isNewTaskDefDialogOpen} onOpenChange={setIsNewTaskDefDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full xs:w-auto" data-testid="button-new-task-definition">
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
                  render={({ field }: { field: any }) => (
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
                  render={({ field }: { field: any }) => (
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
                <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-0 sm:space-x-2">
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
        <CardContent className="p-3 xs:p-4 sm:p-4">
          <div className="flex items-center gap-2 mb-3 text-sm font-medium text-muted-foreground">
            <Filter className="w-4 h-4" />
            <span>Search & Filters</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
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
              <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-archive-filter">
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

      {/* Task Definitions Table (Desktop) */}
      <Card className="hidden md:block">
        <CardHeader className="p-3 xs:p-4 sm:p-6">
          <CardTitle className="flex items-center text-base xs:text-lg">
            <BookOpen className="w-4 h-4 mr-2" />
            Task Definitions
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-full">
            <TableHeader>
              <TableRow>
                <SortableTableHeader
                  columnKey="name"
                  label="Name"
                  direction={sortState.key === "name" ? sortState.direction : null}
                  onSort={toggleSort}
                  className="min-w-[120px]"
                />
                <TableHead className="min-w-[200px] max-w-[300px]">Description</TableHead>
                <SortableTableHeader
                  columnKey="status"
                  label="Status"
                  direction={sortState.key === "status" ? sortState.direction : null}
                  onSort={toggleSort}
                  className="min-w-[80px] hidden sm:table-cell"
                />
                <SortableTableHeader
                  columnKey="createdAt"
                  label="Created"
                  direction={sortState.key === "createdAt" ? sortState.direction : null}
                  onSort={toggleSort}
                  className="min-w-[100px] hidden md:table-cell"
                />
                <TableHead className="min-w-[100px] w-[100px]" data-testid="header-actions">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedTaskDefinitions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    {taskDefinitions.length === 0 
                      ? "No task definitions found. Create your first task definition to get started." 
                      : "No task definitions found matching your search criteria"}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedTaskDefinitions.map((taskDef: TaskDefinition) => (
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
                          aria-label={`Edit ${taskDef.name}`}
                          data-testid={`button-edit-task-def-${taskDef.id}`}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        {taskDef.archived ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="min-h-[44px] min-w-[44px] p-2"
                            onClick={() => { setRestoringTaskDef(taskDef); setIsRestoreDialogOpen(true); }}
                            aria-label={`Restore ${taskDef.name}`}
                            data-testid={`button-restore-task-def-${taskDef.id}`}
                          >
                            <RotateCcw className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        ) : (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="min-h-[44px] min-w-[44px] p-2"
                            onClick={() => { setArchivingTaskDef(taskDef); setIsArchiveDialogOpen(true); }}
                            aria-label={`Archive ${taskDef.name}`}
                            data-testid={`button-archive-task-def-${taskDef.id}`}
                          >
                            <Archive className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            </Table>
          </div>
          {totalTaskDefinitions > pageSize && (
            <div className="border-t border-border/60 px-4 py-3">
              <PaginationControls
                page={currentPage}
                pageSize={pageSize}
                totalCount={totalTaskDefinitions}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Task Definitions (Mobile Cards) */}
      <div className="space-y-3 md:hidden">
        {sortedTaskDefinitions.length === 0 ? (
          <Card>
            <CardContent className="p-4 text-center text-muted-foreground text-sm">
              {taskDefinitions.length === 0 
                ? "No task definitions found. Create your first task definition to get started." 
                : "No task definitions found matching your search criteria"}
            </CardContent>
          </Card>
        ) : (
          <>
          {paginatedTaskDefinitions.map((taskDef) => (
            <Card key={taskDef.id} className="p-4" data-testid={`card-task-def-${taskDef.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-medium break-words">{taskDef.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1 break-words">{taskDef.description || "-"}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Status</span>
                      <div>
                        <Badge variant={taskDef.archived ? "secondary" : "default"}>
                          {taskDef.archived ? "Archived" : "Active"}
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Created</span>
                      <div>{new Date(taskDef.createdAt).toLocaleDateString()}</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-start gap-2 mt-3 pt-3 border-t">
                <Button 
                  variant="ghost" size="sm" className="min-h-[40px]"
                  onClick={() => handleEdit(taskDef)}
                >
                  Edit
                </Button>
                {taskDef.archived ? (
                  <Button 
                    variant="ghost" size="sm" className="min-h-[40px]"
                    onClick={() => { setRestoringTaskDef(taskDef); setIsRestoreDialogOpen(true); }}
                  >
                    Restore
                  </Button>
                ) : (
                  <Button 
                    variant="ghost" size="sm" className="min-h-[40px] text-destructive"
                    onClick={() => { setArchivingTaskDef(taskDef); setIsArchiveDialogOpen(true); }}
                  >
                    Archive
                  </Button>
                )}
              </div>
            </Card>
          ))}
          {totalTaskDefinitions > pageSize && (
            <div className="mt-4">
              <PaginationControls
                page={currentPage}
                pageSize={pageSize}
                totalCount={totalTaskDefinitions}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                className="justify-center"
              />
            </div>
          )}
          </>
        )}
      </div>

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
              <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-0 sm:space-x-2">
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

      {/* Archive Task Definition Dialog */}
      <AlertDialog open={isArchiveDialogOpen} onOpenChange={setIsArchiveDialogOpen}>
        <AlertDialogContent data-testid="dialog-archive-task-def">
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Task Definition</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to archive <strong>{archivingTaskDef?.name}</strong>? You can restore it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-archive-task-def">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (archivingTaskDef) archiveTaskDefMutation.mutate(archivingTaskDef.id); }}
              disabled={archiveTaskDefMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-archive-task-def"
            >
              {archiveTaskDefMutation.isPending ? "Archiving..." : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restore Task Definition Dialog */}
      <AlertDialog open={isRestoreDialogOpen} onOpenChange={setIsRestoreDialogOpen}>
        <AlertDialogContent data-testid="dialog-restore-task-def">
          <AlertDialogHeader>
            <AlertDialogTitle>Restore Task Definition</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to restore <strong>{restoringTaskDef?.name}</strong>? This will make it active again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-restore-task-def">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (restoringTaskDef) restoreTaskDefMutation.mutate(restoringTaskDef.id); }}
              disabled={restoreTaskDefMutation.isPending}
              data-testid="button-confirm-restore-task-def"
            >
              {restoreTaskDefMutation.isPending ? "Restoring..." : "Restore"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </RouteGuard>
  );
}
