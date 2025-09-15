import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Badge } from "@/shared/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { TaskCommentsModal } from "@/features/comments/components/task-comments-modal";
import { TaskCommentsButton } from "@/features/comments/components/task-comments-button";
import { useCommentStats } from "@/features/comments/api";
import { Switch } from "@/shared/components/ui/switch";
import { Label } from "@/shared/components/ui/label";
import { useState, useEffect } from "react";
import { Plus, Search, Filter, Calendar, Clock, AlertTriangle, MessageSquare } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { TaskStatusCell } from "@/features/tasks/components/task-status-cell";
import { useAuth } from "@/features/auth/hooks/use-auth.tsx";
import { Link } from "wouter";
import type { CandidateTask, Candidate } from "@shared/schemas";

export default function MyTasksPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [openTaskComments, setOpenTaskComments] = useState<{ id: string; title?: string; candidateId: string } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [showCanceled, setShowCanceled] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const { user } = useAuth();

  const { data: myTasks = [], isLoading } = useQuery<CandidateTask[]>({
    // Include user id in key to prevent cross-user cache reuse
    queryKey: ["/api/tasks/mine", user?.id, { showArchived, showCanceled, showCompleted }],
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
    },
    enabled: !!user,
  });

  const { data: candidates = [] } = useQuery<Candidate[]>({
    queryKey: ["/api/candidates"],
  });

  function TaskCommentsAction({ candidateId, taskId, taskTitle, onOpen }: { candidateId: string; taskId: string; taskTitle: string; onOpen: () => void }) {
    const { data: commentStats } = useCommentStats(candidateId);
    const count = (commentStats as any)?.byTask?.[taskId]?.totalVisible || 0;
    const aria = `Open comments for task ${taskTitle}`; // TaskCommentsButton appends ", N comments"
    return (
      <TaskCommentsButton
        count={count}
        onClick={onOpen}
        ariaLabel={aria}
      />
    );
  }

  // User preferences query
  const { data: preferences } = useQuery({
    // Include user id in key to avoid sharing prefs between sessions
    queryKey: ["/api/me/preferences", user?.id],
    queryFn: async () => {
      const response = await fetch("/api/me/preferences");
      if (!response.ok) throw new Error('Failed to fetch preferences');
      return response.json();
    },
    enabled: !!user,
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

  // Removed task update mutation (dialog removed). Status changes are handled inline via TaskStatusCell.

  const filteredTasks = myTasks.filter((task: CandidateTask) => {
    const matchesSearch = task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        (task.description && task.description.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = statusFilter === "all" || task.status === statusFilter;
    const matchesPriority = priorityFilter === "all" || task.priority === priorityFilter;
    
    return matchesSearch && matchesStatus && matchesPriority;
  });

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

  // No edit/update handlers needed; comments open via modal per-row.

  const getCandidateName = (task: any) => {
    // Use candidate info from task response (guaranteed by backend INNER JOIN)
    if (task.candidate) {
      return `${task.candidate.firstName} ${task.candidate.lastName}`;
    }
    // Fallback to candidates query
    const candidate = candidates.find((c: Candidate) => c.id === task.candidateId);
    return candidate ? `${candidate.firstName} ${candidate.lastName}` : `Task ${task.id.slice(0, 8)}...`;
  };

  const getCandidateStatusForTask = (task: any): string => {
    // Prefer embedded candidate status when present
    const embedded = (task as any)?.candidate?.status as string | undefined;
    if (embedded) return embedded;
    // Fallback to candidates query cache
    const cid = (task as any)?.candidateId as string | undefined;
    const match = cid ? (candidates as any[])?.find((c: any) => c.id === cid) : undefined;
    return (match?.status as string | undefined) ?? 'draft';
  };

  const isTaskStatusEditable = (task: any): boolean => {
    if (!task) return true;
    const status = getCandidateStatusForTask(task);
    return ['draft', 'active', 'on_hold'].includes(status);
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
      <div className="p-4 sm:p-6 space-y-4 xs:space-y-5 sm:space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 xs:h-8 bg-muted rounded w-1/4"></div>
          <div className="h-24 xs:h-32 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 xs:space-y-5 sm:space-y-6">
      {/* Page Header */}
      <div className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-3 xs:gap-4">
        <div className="min-w-0">
          <h1 className="text-lg xs:text-xl sm:text-2xl font-bold text-foreground" data-testid="text-my-tasks-title">My Tasks</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Tasks assigned to you</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card>
          <CardContent className="p-3 xs:p-4">
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
          <CardContent className="p-3 xs:p-4">
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
          <CardContent className="p-3 xs:p-4">
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
          <CardContent className="p-3 xs:p-4">
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
        <CardHeader className="p-3 xs:p-4 sm:p-6">
          <CardTitle className="flex items-center text-base xs:text-lg">
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 xs:p-4 sm:p-6 pt-0">
          <div className="space-y-4">
            {/* Search and Select Filters */}
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
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
                <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-status-filter">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="todo">To Do</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="blocked">Blocked</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                  <SelectItem value="canceled">Canceled</SelectItem>
                </SelectContent>
              </Select>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-priority-filter">
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
            </div>
            
            {/* Toggle Switches */}
            <div className="flex flex-col xs:flex-row flex-wrap gap-3 xs:gap-4">
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

      {/* Tasks Table (Desktop) */}
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-full">
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[140px]">Task</TableHead>
                  <TableHead className="min-w-[120px]">Candidate</TableHead>
                  <TableHead className="min-w-[80px] hidden sm:table-cell">Priority</TableHead>
                  <TableHead className="min-w-[100px]">Status</TableHead>
                  <TableHead className="min-w-[100px] hidden md:table-cell">Due Date</TableHead>
                  <TableHead className="min-w-[80px] w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
            <TableBody>
              {filteredTasks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 sm:py-8 text-muted-foreground text-sm sm:text-base">
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
                    <TableCell className="p-2 xs:p-3 sm:p-4">
                      <div>
                        <div className="font-medium text-sm sm:text-base break-words">{task.title}</div>
                        {task.description && (
                          <div className="text-xs sm:text-sm text-muted-foreground mt-1 break-words">{task.description}</div>
                        )}
                        {/* Show priority on mobile when priority column is hidden */}
                        <div className="sm:hidden mt-1">
                          <div className={`flex items-center space-x-1 text-xs ${getPriorityColor(task.priority)}`}>
                            {getPriorityIcon(task.priority)}
                            <span className="capitalize">{task.priority}</span>
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="p-2 xs:p-3 sm:p-4">
                      <div className="flex flex-col gap-1">
                        <Link href={`/candidates/${task.candidateId}`} className="text-primary hover:underline text-sm break-words">
                          {getCandidateName(task)}
                        </Link>
                        {/* Show candidate status badge if not active/on_hold */}
                        {(task as any).candidate?.status && !['active', 'on_hold'].includes((task as any).candidate.status) && (
                          <Badge variant="outline" className="text-xs bg-muted text-muted-foreground w-fit">
                            {(task as any).candidate.status === 'archived' && '(Archived)'}
                            {(task as any).candidate.status === 'canceled' && '(Canceled)'}
                            {(task as any).candidate.status === 'completed' && '(Completed)'}
                          </Badge>
                        )}
                        {/* Show on hold status */}
                        {(task as any).candidate?.status === 'on_hold' && (
                          <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200 w-fit">
                            On Hold
                          </Badge>
                        )}
                        {/* Show due date on mobile when due date column is hidden */}
                        <div className="md:hidden text-xs text-muted-foreground">
                          {task.dueAt ? (
                            <div className={`${isOverdue(task.dueAt) && task.status !== "done" ? "text-destructive font-medium" : ""}`}>
                              Due: {new Date(task.dueAt).toLocaleDateString()}
                              {isOverdue(task.dueAt) && task.status !== "done" && (
                                <span className="block text-destructive">Overdue</span>
                              )}
                              {isDueSoon(task.dueAt) && task.status !== "done" && !isOverdue(task.dueAt) && (
                                <span className="block text-chart-3">Due Soon</span>
                              )}
                            </div>
                          ) : (
                            "No due date"
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell p-2 xs:p-3 sm:p-4">
                      <div className={`flex items-center space-x-2 ${getPriorityColor(task.priority)}`}>
                        {getPriorityIcon(task.priority)}
                        <span className="capitalize text-sm">{task.priority}</span>
                      </div>
                    </TableCell>
                    <TableCell className="p-2 xs:p-3 sm:p-4">
                      <TaskStatusCell
                        taskId={task.id}
                        candidateId={task.candidateId}
                        value={task.status}
                        disabled={!isTaskStatusEditable(task)}
                        colorStyle="filled"
                      />
                    </TableCell>
                    <TableCell className="hidden md:table-cell p-2 xs:p-3 sm:p-4">
                      {task.dueAt ? (
                        <div className={`text-sm ${isOverdue(task.dueAt) && task.status !== "done" ? "text-destructive font-medium" : ""}`}>
                          {new Date(task.dueAt).toLocaleDateString()}
                          {isOverdue(task.dueAt) && task.status !== "done" && (
                            <span className="block text-xs">Overdue</span>
                          )}
                          {isDueSoon(task.dueAt) && task.status !== "done" && !isOverdue(task.dueAt) && (
                            <span className="block text-xs text-chart-3">Due Soon</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="p-2 xs:p-3 sm:p-4">
                      <TaskCommentsAction
                        candidateId={task.candidateId}
                        taskId={task.id}
                        taskTitle={task.title}
                        onOpen={() => setOpenTaskComments({ id: task.id, title: task.title, candidateId: task.candidateId })}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Tasks List (Mobile) */}
      <div className="space-y-3 md:hidden">
        {filteredTasks.length === 0 ? (
          <Card>
            <CardContent className="p-4 text-center text-muted-foreground text-sm">
              {myTasks.length === 0 ? "No tasks assigned to you" : "No tasks found matching your criteria"}
            </CardContent>
          </Card>
        ) : (
          filteredTasks.map((task: CandidateTask) => (
            <Card key={task.id} className={`p-4 ${isOverdue(task.dueAt) && task.status !== "done" ? "bg-destructive/5" : ""}`} data-testid={`card-my-task-${task.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-medium text-foreground break-words">{task.title}</h3>
                  {task.description && (
                    <p className="text-xs text-muted-foreground mt-1 break-words">{task.description}</p>
                  )}
                  <div className="mt-2 grid grid-cols-2 gap-y-2 gap-x-3 text-xs">
                    <div>
                      <span className="text-muted-foreground">Candidate</span>
                      <div>
                        <Link href={`/candidates/${task.candidateId}`} className="text-primary hover:underline break-words">
                          {getCandidateName(task)}
                        </Link>
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Priority</span>
                      <div className={`${getPriorityColor(task.priority)} capitalize`}>{task.priority}</div>
                    </div>
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Due</span>
                      <div className={`mt-0.5 ${isOverdue(task.dueAt) && task.status !== "done" ? "text-destructive font-medium" : ""}`}>
                        {task.dueAt ? new Date(task.dueAt).toLocaleDateString() : "-"}
                        {isOverdue(task.dueAt) && task.status !== "done" && (
                          <span className="ml-2 text-xs">Overdue</span>
                        )}
                        {isDueSoon(task.dueAt) && task.status !== "done" && !isOverdue(task.dueAt) && (
                          <span className="ml-2 text-xs text-chart-3">Due Soon</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-start gap-2 mt-3 pt-3 border-t">
                <TaskCommentsAction
                  candidateId={task.candidateId}
                  taskId={task.id}
                  taskTitle={task.title}
                  onOpen={() => setOpenTaskComments({ id: task.id, title: task.title, candidateId: task.candidateId })}
                />
              </div>
            </Card>
          ))
        )}
      </div>
      {openTaskComments && (
        <TaskCommentsModal
          open={!!openTaskComments}
          taskId={openTaskComments.id}
          taskTitle={openTaskComments.title}
          candidateId={openTaskComments.candidateId}
          onClose={() => setOpenTaskComments(null)}
        />
      )}
    </div>
  );
}
