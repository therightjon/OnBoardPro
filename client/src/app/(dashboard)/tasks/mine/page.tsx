import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Badge } from "@/shared/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { Textarea } from "@/shared/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/shared/components/ui/dialog";
import { Switch } from "@/shared/components/ui/switch";
import { Label } from "@/shared/components/ui/label";
import { useState, useEffect } from "react";
import { Plus, Search, Filter, Edit, Calendar, Clock, AlertTriangle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuth } from "@/features/auth/hooks/use-auth.tsx";
import { Link } from "wouter";
import type { CandidateTask, Candidate } from "@shared/schemas";

export default function MyTasksPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [editingTask, setEditingTask] = useState<any>(null);
  const [taskNotes, setTaskNotes] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [showCanceled, setShowCanceled] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: myTasks = [], isLoading } = useQuery<CandidateTask[]>({
    queryKey: ["/api/tasks/mine", { showArchived, showCanceled, showCompleted }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (showArchived) params.append('showArchived', '1');
      if (showCanceled) params.append('showCanceled', '1');
      if (showCompleted) params.append('showCompleted', '1');
      const url = `/api/tasks/mine${params.toString() ? '?' + params.toString() : ''}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.json();
    }
  });

  const { data: candidates = [] } = useQuery<Candidate[]>({
    queryKey: ["/api/candidates"],
  });

  // User preferences query
  const { data: preferences } = useQuery({
    queryKey: ["/api/me/preferences"],
    queryFn: async () => {
      const response = await fetch("/api/me/preferences");
      if (!response.ok) throw new Error('Failed to fetch preferences');
      return response.json();
    }
  });

  // Update preferences mutation
  const updatePreferencesMutation = useMutation({
    mutationFn: async (newPreferences: any) => {
      const res = await apiRequest("PATCH", "/api/me/preferences", newPreferences);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/me/preferences"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/mine"] });
    }
  });

  // Initialize toggle states from preferences
  useEffect(() => {
    if (preferences) {
      setShowArchived(preferences.mytasksShowArchived || false);
      setShowCanceled(preferences.mytasksShowCanceled || false);
      setShowCompleted(preferences.mytasksShowCompleted || false);
    }
  }, [preferences]);

  // Handle toggle changes with preference persistence
  const handleToggleChange = (type: 'archived' | 'canceled' | 'completed', value: boolean) => {
    const updates: any = {};
    
    if (type === 'archived') {
      setShowArchived(value);
      updates.mytasksShowArchived = value;
    } else if (type === 'canceled') {
      setShowCanceled(value);
      updates.mytasksShowCanceled = value;
    } else if (type === 'completed') {
      setShowCompleted(value);
      updates.mytasksShowCompleted = value;
    }
    
    // Persist to backend
    updatePreferencesMutation.mutate(updates);
  };

  const updateTaskMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/tasks/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/mine"] });
      setEditingTask(null);
      setTaskNotes("");
      toast({
        title: "Success",
        description: "Task updated successfully",
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

  const filteredTasks = myTasks.filter((task: CandidateTask) => {
    const matchesSearch = task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        (task.description && task.description.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = statusFilter === "all" || task.status === statusFilter;
    const matchesPriority = priorityFilter === "all" || task.priority === priorityFilter;
    
    return matchesSearch && matchesStatus && matchesPriority;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "todo": return "bg-muted text-muted-foreground";
      case "in_progress": return "bg-chart-3/10 text-chart-3";
      case "blocked": return "bg-chart-4/10 text-chart-4";
      case "done": return "bg-accent/10 text-accent";
      case "canceled": return "bg-destructive/10 text-destructive";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "critical": return "text-destructive";
      case "high": return "text-chart-4";
      case "medium": return "text-purple-700";
      case "low": return "text-muted-foreground";
      default: return "text-muted-foreground";
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case "critical": return <AlertTriangle className="w-4 h-4" />;
      case "high": return <Clock className="w-4 h-4" />;
      case "medium": return <Calendar className="w-4 h-4" />;
      default: return null;
    }
  };

  const handleStatusUpdate = (taskId: string, newStatus: string) => {
    updateTaskMutation.mutate({
      id: taskId,
      data: { 
        status: newStatus,
        ...(newStatus === "done" && { completedAt: new Date().toISOString() })
      }
    });
  };

  const handleTaskEdit = (task: any) => {
    setEditingTask(task);
    setTaskNotes(task.notes || "");
  };

  const handleTaskUpdate = () => {
    if (!editingTask) return;
    
    updateTaskMutation.mutate({
      id: editingTask.id,
      data: {
        status: editingTask.status,
        notes: taskNotes,
      }
    });
  };

  const getCandidateName = (task: any) => {
    // Use candidate info from task response (guaranteed by backend INNER JOIN)
    if (task.candidate) {
      return `${task.candidate.firstName} ${task.candidate.lastName}`;
    }
    // Fallback to candidates query
    const candidate = candidates.find((c: Candidate) => c.id === task.candidateId);
    return candidate ? `${candidate.firstName} ${candidate.lastName}` : `Task ${task.id.slice(0, 8)}...`;
  };

  const isOverdue = (dueAt: Date | null) => {
    return dueAt && new Date(dueAt) < new Date();
  };

  const isDueSoon = (dueAt: Date | null) => {
    if (!dueAt) return false;
    const dueDate = new Date(dueAt);
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    return dueDate <= sevenDaysFromNow && dueDate >= new Date();
  };

  // Calculate summary stats
  const todoTasks = myTasks.filter((t: CandidateTask) => t.status === "todo").length;
  const inProgressTasks = myTasks.filter((t: CandidateTask) => t.status === "in_progress").length;
  const overdueTasks = myTasks.filter((t: any) => 
    isOverdue(t.dueAt) && 
    t.status !== "done" && 
    t.candidate?.status && 
    ['active', 'on_hold'].includes(t.candidate.status)
  ).length;
  const dueSoonTasks = myTasks.filter((t: any) => 
    isDueSoon(t.dueAt) && 
    t.status !== "done" && 
    t.candidate?.status && 
    ['active', 'on_hold'].includes(t.candidate.status)
  ).length;

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
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground" data-testid="text-my-tasks-title">My Tasks</h1>
        <p className="text-muted-foreground">Tasks assigned to you</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">To Do</p>
                <p className="text-2xl font-bold text-foreground" data-testid="text-todo-count">{todoTasks}</p>
              </div>
              <div className="w-8 h-8 bg-muted/20 rounded-lg flex items-center justify-center">
                <Clock className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">In Progress</p>
                <p className="text-2xl font-bold text-foreground" data-testid="text-in-progress-count">{inProgressTasks}</p>
              </div>
              <div className="w-8 h-8 bg-chart-3/20 rounded-lg flex items-center justify-center">
                <Calendar className="w-4 h-4 text-purple-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Due Soon</p>
                <p className="text-2xl font-bold text-foreground" data-testid="text-due-soon-count">{dueSoonTasks}</p>
              </div>
              <div className="w-8 h-8 bg-chart-3/20 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-chart-3" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Overdue</p>
                <p className="text-2xl font-bold text-foreground" data-testid="text-overdue-count">{overdueTasks}</p>
              </div>
              <div className="w-8 h-8 bg-destructive/20 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-4 h-4 text-destructive" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search my tasks..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-my-tasks"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="todo">To Do</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="blocked">Blocked</SelectItem>
                <SelectItem value="done">Done</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-priority-filter">
                <SelectValue placeholder="Filter by priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex items-center space-x-2">
                <Switch 
                  id="show-archived" 
                  checked={showArchived}
                  onCheckedChange={(value) => handleToggleChange('archived', value)}
                  data-testid="switch-show-archived"
                />
                <Label htmlFor="show-archived" className="text-sm font-medium">
                  Show Archived
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch 
                  id="show-canceled" 
                  checked={showCanceled}
                  onCheckedChange={(value) => handleToggleChange('canceled', value)}
                  data-testid="switch-show-canceled"
                />
                <Label htmlFor="show-canceled" className="text-sm font-medium">
                  Show Canceled
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch 
                  id="show-completed" 
                  checked={showCompleted}
                  onCheckedChange={(value) => handleToggleChange('completed', value)}
                  data-testid="switch-show-completed"
                />
                <Label htmlFor="show-completed" className="text-sm font-medium">
                  Show Completed
                </Label>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tasks Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Candidate</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTasks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    {myTasks.length === 0 ? "No tasks assigned to you" : "No tasks found matching your criteria"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredTasks.map((task: CandidateTask) => (
                  <TableRow 
                    key={task.id} 
                    className={`hover:bg-muted/50 ${
                      isOverdue(task.dueAt) && task.status !== "done" ? "bg-destructive/5" : ""
                    } ${
                      (task as any).candidate?.status && !['active', 'on_hold'].includes((task as any).candidate.status) 
                        ? "opacity-75" 
                        : ""
                    }`}
                    data-testid={`row-my-task-${task.id}`}
                  >
                    <TableCell>
                      <div>
                        <div className="font-medium">{task.title}</div>
                        {task.description && (
                          <div className="text-sm text-muted-foreground">{task.description}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Link href={`/candidates/${task.candidateId}`} className="text-primary hover:underline">
                          {getCandidateName(task)}
                        </Link>
                        {/* Show candidate status badge if not active/on_hold */}
                        {(task as any).candidate?.status && !['active', 'on_hold'].includes((task as any).candidate.status) && (
                          <Badge variant="outline" className="text-xs bg-muted text-muted-foreground">
                            {(task as any).candidate.status === 'archived' && '(Archived)'}
                            {(task as any).candidate.status === 'canceled' && '(Canceled)'}
                            {(task as any).candidate.status === 'completed' && '(Completed)'}
                          </Badge>
                        )}
                        {/* Show on hold status */}
                        {(task as any).candidate?.status === 'on_hold' && (
                          <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                            On Hold
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className={`flex items-center space-x-2 ${getPriorityColor(task.priority)}`}>
                        {getPriorityIcon(task.priority)}
                        <span className="capitalize">{task.priority}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={task.status}
                        onValueChange={(value) => handleStatusUpdate(task.id, value)}
                      >
                        <SelectTrigger className="w-[120px]">
                          <Badge className={getStatusColor(task.status)}>
                            {task.status.replace('_', ' ').toUpperCase()}
                          </Badge>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="todo">To Do</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="blocked">Blocked</SelectItem>
                          <SelectItem value="done">Done</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {task.dueAt ? (
                        <div className={`${isOverdue(task.dueAt) && task.status !== "done" ? "text-destructive font-medium" : ""}`}>
                          {new Date(task.dueAt).toLocaleDateString()}
                          {isOverdue(task.dueAt) && task.status !== "done" && (
                            <span className="block text-xs">Overdue</span>
                          )}
                          {isDueSoon(task.dueAt) && task.status !== "done" && !isOverdue(task.dueAt) && (
                            <span className="block text-xs text-chart-3">Due Soon</span>
                          )}
                        </div>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>
                      <Dialog open={editingTask?.id === task.id} onOpenChange={(open) => !open && setEditingTask(null)}>
                        <DialogTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleTaskEdit(task)}
                            data-testid={`button-edit-my-task-${task.id}`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-[95vw] w-full sm:max-w-2xl max-h-[90vh] sm:max-h-min overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>Update Task</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div>
                              <h3 className="font-medium">{editingTask?.title}</h3>
                              <p className="text-sm text-muted-foreground">{editingTask?.description}</p>
                            </div>
                            
                            <div>
                              <label className="text-sm font-medium">Status</label>
                              <Select
                                value={editingTask?.status}
                                onValueChange={(value) => setEditingTask({ ...editingTask, status: value })}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="todo">To Do</SelectItem>
                                  <SelectItem value="in_progress">In Progress</SelectItem>
                                  <SelectItem value="blocked">Blocked</SelectItem>
                                  <SelectItem value="done">Done</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div>
                              <label className="text-sm font-medium">Notes</label>
                              <Textarea
                                value={taskNotes}
                                onChange={(e) => setTaskNotes(e.target.value)}
                                placeholder="Add notes about this task..."
                                className="mt-1"
                              />
                            </div>

                            <div className="flex justify-end space-x-2">
                              <Button variant="outline" onClick={() => setEditingTask(null)}>
                                Cancel
                              </Button>
                              <Button onClick={handleTaskUpdate} disabled={updateTaskMutation.isPending}>
                                {updateTaskMutation.isPending ? "Updating..." : "Update Task"}
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
