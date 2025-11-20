import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Avatar, AvatarFallback } from "@/shared/components/ui/avatar";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { 
  Users, 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  Plus, 
  Download,
  UserPlus,
  ArrowRight,
  CircleAlert,
  ClipboardList,
  Stethoscope,
  UserRound,
  Laptop,
  UsersIcon
} from "lucide-react";
import { useLocation } from "wouter";
import { useMemo, useState } from "react";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { 
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogAction,
} from "@/shared/components/ui/alert-dialog";
import { format, formatDistanceToNow } from "date-fns";
import type { CandidateType } from "@shared/schemas";

type DivisionOverviewItem = {
  divisionId: string;
  divisionName: string;
  departmentId: string;
  departmentName: string;
  activeCandidateCount: number;
};

type DivisionOverviewRenderItem =
  | { kind: "data"; key: string; entry: DivisionOverviewItem }
  | { kind: "loading"; key: string }
  | { kind: "placeholder"; key: string };

const divisionIconConfigs = [
  { Icon: Stethoscope, bgClass: "bg-primary/10", iconClass: "text-primary" },
  { Icon: UserRound, bgClass: "bg-chart-2/10", iconClass: "text-chart-2" },
  { Icon: Laptop, bgClass: "bg-chart-3/10", iconClass: "text-chart-3" },
  { Icon: UsersIcon, bgClass: "bg-chart-4/10", iconClass: "text-chart-4" },
] as const;

export default function Dashboard() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const canViewDivisionOverview = user ? [
    "system_admin",
    "hr_staff",
    "department_admin",
    "division_leader",
    "manager"
  ].includes(user.role) : false;
  const [showNoPermission, setShowNoPermission] = useState(false);
  const { data: candidates = [] } = useQuery<any[]>({
    // Include user id in the key, but fetch base URL explicitly
    queryKey: ["/api/candidates", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const res = await fetch('/api/candidates', { credentials: 'include' });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    }
  });

  const { data: tasks = [] } = useQuery<any[]>({
    // Include user id in the key, but fetch base URL explicitly
    queryKey: ["/api/tasks/dashboard", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const res = await fetch('/api/tasks/dashboard', { credentials: 'include' });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    }
  });

  const { data: candidateTypes = [] } = useQuery<CandidateType[]>({
    queryKey: ["/api/candidate-types", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const res = await fetch('/api/candidate-types', { credentials: 'include' });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    }
  });

  const { data: divisionOverview = [], isLoading: divisionOverviewLoading, error: divisionOverviewError } = useQuery<DivisionOverviewItem[]>({
    queryKey: ["/api/dashboard/divisions", user?.id],
    enabled: !!user && canViewDivisionOverview,
    queryFn: async () => {
      const res = await fetch('/api/dashboard/divisions?limit=4', { credentials: 'include' });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    }
  });

  const statusBadgeVariants: Record<string, string> = {
    draft: "bg-muted/70 text-muted-foreground",
    active: "bg-primary/10 text-primary",
    on_hold: "bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200",
    completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-200",
    canceled: "bg-destructive/10 text-destructive",
    archived: "bg-muted/70 text-muted-foreground"
  };

  const formatStatusLabel = (status?: string) => {
    if (!status) return "Unknown";
    return status
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  };

  const getStatusBadgeClass = (status?: string) => statusBadgeVariants[status ?? ""] ?? "bg-muted/70 text-muted-foreground";

  const getCandidateTypeName = (candidateTypeId?: string) => {
    const match = candidateTypes.find((type) => type.id === candidateTypeId);
    return match?.name ?? "Role TBD";
  };

  const getInitials = (firstName?: string, lastName?: string) => {
    const first = firstName?.charAt(0) ?? "";
    const last = lastName?.charAt(0) ?? "";
    return (first + last).toUpperCase() || "?";
  };

  const upcomingStarts = useMemo(() => {
    const withStartDates = candidates
      .filter((candidate: any) => candidate.status !== "canceled")
      .map((candidate: any) => {
        if (!candidate.anticipatedStartDate) return null;
        const startDate = new Date(candidate.anticipatedStartDate);
        if (isNaN(startDate.getTime())) return null;
        return { ...candidate, startDate };
      })
      .filter(Boolean) as Array<any & { startDate: Date }>;

    if (withStartDates.length === 0) return [];

    const sorted = [...withStartDates].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const upcoming = sorted.filter((entry) => entry.startDate >= startOfToday);
    const prioritized = upcoming.length > 0 ? upcoming : sorted;
    return prioritized.slice(0, 4);
  }, [candidates]);

  // Calculate metrics
  const activeCandidates = candidates.filter((c: any) => c.status === "active").length;
  const tasksDue = tasks.filter((t: any) => {
    if (!t.dueAt) return false;
    const dueDate = new Date(t.dueAt);
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    return dueDate <= sevenDaysFromNow && t.status !== "done";
  }).length;
  const overdueTasks = tasks.filter((t: any) => {
    if (!t.dueAt) return false;
    const dueDate = new Date(t.dueAt);
    return dueDate < new Date() && t.status !== "done";
  }).length;
  const completedTasks = tasks.filter((t: any) => t.status === "done").length;
  const totalTasks = tasks.length;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const urgentTasks = tasks
    .filter((t: any) => t.priority === "critical" || (t.dueAt && new Date(t.dueAt) < new Date()))
    .slice(0, 3);

  const divisionOverviewItems = useMemo<DivisionOverviewRenderItem[]>(() => {
    if (!canViewDivisionOverview) return [];
    if (divisionOverviewLoading) {
      return Array.from({ length: 4 }, (_, index) => ({
        kind: "loading" as const,
        key: `division-loading-${index}`
      }));
    }
    const entries = divisionOverview.slice(0, 4).map((entry) => ({
      kind: "data" as const,
      key: entry.divisionId,
      entry
    }));
    const placeholdersNeeded = Math.max(0, 4 - entries.length);
    const placeholders = Array.from({ length: placeholdersNeeded }, (_, index) => ({
      kind: "placeholder" as const,
      key: `division-placeholder-${index}`
    }));
    return [...entries, ...placeholders];
  }, [divisionOverview, divisionOverviewLoading, canViewDivisionOverview]);

  return (
    <div className="p-4 sm:p-6 space-y-4 xs:space-y-5 sm:space-y-6">
      {/* Page Header */}
      <div className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-3 xs:gap-4">
        <div className="min-w-0">
          <h1 className="text-lg xs:text-xl sm:text-2xl font-bold text-foreground" data-testid="text-dashboard-title">Dashboard</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Welcome back, manage your hiring pipeline</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 xs:gap-3">
          <Button variant="secondary" size="sm" className="min-h-[44px] px-3 xs:px-4" data-testid="button-export-report">
            <Download className="w-4 h-4 xs:mr-2" />
            <span className="hidden xs:inline">Export Report</span>
          </Button>
          <Button
            size="sm"
            className="min-h-[44px] px-3 xs:px-4"
            data-testid="button-new-candidate"
            onClick={() => {
              const canCreate = user && [
                'system_admin',
                'hr_staff',
                'department_admin',
                'division_leader',
                'manager',
              ].includes(user.role);
              if (canCreate) {
                setLocation('/candidates?new=1');
              } else {
                setShowNoPermission(true);
              }
            }}
          >
            <Plus className="w-4 h-4 xs:mr-2" />
            <span className="hidden xs:inline">New Candidate</span>
          </Button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
        <Card className="hover:shadow-md transition-shadow" data-testid="card-active-candidates">
          <CardContent className="p-3 xs:p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs xs:text-sm font-medium text-muted-foreground">Active Candidates</p>
                <p className="text-xl xs:text-2xl sm:text-3xl font-bold text-foreground" data-testid="text-active-candidates">{activeCandidates}</p>
              </div>
              <div className="w-10 h-10 xs:w-12 xs:h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <Users className="text-primary text-lg xs:text-xl" />
              </div>
            </div>
            <div className="mt-3 xs:mt-4 flex items-center text-xs xs:text-sm">
              <span className="text-accent">+8.2%</span>
              <span className="text-muted-foreground ml-2">from last month</span>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow" data-testid="card-tasks-due">
          <CardContent className="p-3 xs:p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs xs:text-sm font-medium text-muted-foreground">Tasks Due (7 days)</p>
                <p className="text-xl xs:text-2xl sm:text-3xl font-bold text-foreground" data-testid="text-tasks-due">{tasksDue}</p>
              </div>
              <div className="w-10 h-10 xs:w-12 xs:h-12 bg-chart-3/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <Clock className="text-chart-3 text-lg xs:text-xl" />
              </div>
            </div>
            <div className="mt-3 xs:mt-4 flex items-center text-xs xs:text-sm">
              <span className="text-chart-3">-3.1%</span>
              <span className="text-muted-foreground ml-2">from last week</span>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow" data-testid="card-overdue-tasks">
          <CardContent className="p-3 xs:p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs xs:text-sm font-medium text-muted-foreground">Overdue Tasks</p>
                <p className="text-xl xs:text-2xl sm:text-3xl font-bold text-foreground" data-testid="text-overdue-tasks">{overdueTasks}</p>
              </div>
              <div className="w-10 h-10 xs:w-12 xs:h-12 bg-destructive/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="text-destructive text-lg xs:text-xl" />
              </div>
            </div>
            <div className="mt-3 xs:mt-4 flex items-center text-xs xs:text-sm">
              <span className="text-destructive">+1</span>
              <span className="text-muted-foreground ml-2">new this week</span>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow" data-testid="card-completion-rate">
          <CardContent className="p-3 xs:p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs xs:text-sm font-medium text-muted-foreground">Completion Rate</p>
                <p className="text-xl xs:text-2xl sm:text-3xl font-bold text-foreground" data-testid="text-completion-rate">{completionRate}%</p>
              </div>
              <div className="w-10 h-10 xs:w-12 xs:h-12 bg-accent/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <CheckCircle className="text-accent text-lg xs:text-xl" />
              </div>
            </div>
            <div className="mt-3 xs:mt-4 flex items-center text-xs xs:text-sm">
              <span className="text-accent">+5.3%</span>
              <span className="text-muted-foreground ml-2">from last month</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 md:gap-6">
        {/* Upcoming Starts */}
        <Card className="flex flex-col" data-testid="card-upcoming-starts">
          <CardHeader className="p-3 sm:p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle className="text-base xs:text-lg sm:text-xl">Upcoming Starts</CardTitle>
                <p className="hidden xs:block text-xs text-muted-foreground mt-1">Next anticipated start dates</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="min-h-[44px] gap-1.5 text-xs xs:text-sm"
                onClick={() => setLocation('/candidates')}
              >
                View All
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 pt-0 flex-1">
            {upcomingStarts.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center gap-2 py-8 text-muted-foreground h-full">
                <CircleAlert className="w-8 h-8 text-muted-foreground/70" />
                <div>
                  <p className="text-sm font-medium text-foreground">No upcoming start dates</p>
                  <p className="text-xs">Once start dates are scheduled they will appear here.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingStarts.map((candidate: any) => (
                  <div
                    key={candidate.id}
                    className="rounded-xl border border-border/70 p-3 sm:p-3.5 hover:border-primary/40 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      <Avatar className="h-10 w-10 border border-border/70">
                        <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                          {getInitials(candidate.firstName, candidate.lastName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">
                              {candidate.firstName} {candidate.lastName}
                            </p>
                          </div>
                          <Badge variant="secondary" className={`shrink-0 ${getStatusBadgeClass(candidate.status)}`}>
                            {formatStatusLabel(candidate.status)}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                          <p className="text-muted-foreground truncate">{getCandidateTypeName(candidate.candidateTypeId)}</p>
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Clock className="w-3.5 h-3.5 text-primary" />
                            <span className="font-medium text-foreground">{format(candidate.startDate, "MMM d, yyyy")} {formatDistanceToNow(candidate.startDate, { addSuffix: true })}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card data-testid="card-recent-activity">
          <CardHeader className="p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base xs:text-lg sm:text-xl">Recent Activity</CardTitle>
              <Button variant="link" size="sm" className="text-primary text-xs xs:text-sm">View All</Button>
            </div>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 pt-0 max-w-full">
            <div className="space-y-2">
              <div className="flex items-start gap-2.5 p-2.5 sm:p-3 rounded-lg hover:bg-muted/50 transition-colors">
                <div className="w-8 h-8 bg-accent/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <UserPlus className="text-accent text-sm" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 w-full">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-sm text-foreground truncate">New candidate <span className="font-medium">Sarah Johnson</span> added</p>
                      <Badge variant="secondary" className="shrink-0">New</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground whitespace-nowrap sm:ml-2">2 hours ago</p>
                  </div>
                </div>
              </div>
              
              <div className="flex items-start gap-2.5 p-2.5 sm:p-3 rounded-lg hover:bg-muted/50 transition-colors">
                <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="text-primary text-sm" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 w-full">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-sm text-foreground truncate">Task completed: <span className="font-medium">Background Check</span></p>
                      <Badge className="shrink-0">Completed</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground whitespace-nowrap sm:ml-2">4 hours ago</p>
                  </div>
                </div>
              </div>
              
              <div className="flex items-start gap-2.5 p-2.5 sm:p-3 rounded-lg hover:bg-muted/50 transition-colors">
                <div className="w-8 h-8 bg-chart-3/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <ArrowRight className="text-chart-3 text-sm" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 w-full">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-sm text-foreground truncate"><span className="font-medium">Michael Chen</span> moved to Offer stage</p>
                      <Badge variant="outline" className="shrink-0">Stage</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground whitespace-nowrap sm:ml-2">6 hours ago</p>
                  </div>
                </div>
              </div>
              
              <div className="flex items-start gap-2.5 p-2.5 sm:p-3 rounded-lg hover:bg-muted/50 transition-colors">
                <div className="w-8 h-8 bg-destructive/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <CircleAlert className="text-destructive text-sm" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 w-full">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-sm text-foreground truncate">Task overdue: <span className="font-medium">Reference Check</span></p>
                      <Badge variant="destructive" className="shrink-0">Overdue</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground whitespace-nowrap sm:ml-2">1 day ago</p>
                  </div>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-3 sm:p-4 rounded-lg hover:bg-muted/50 transition-colors">
                <div className="w-8 h-8 bg-chart-2/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <ClipboardList className="text-chart-2 text-sm" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 w-full">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-sm text-foreground truncate">Template applied: <span className="font-medium">Faculty - Base</span></p>
                      <Badge variant="secondary" className="shrink-0">Template</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground whitespace-nowrap sm:ml-2">2 days ago</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions and Tasks Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 md:gap-6">
        {/* Urgent Tasks */}
        <Card data-testid="card-urgent-tasks">
          <CardHeader className="p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base xs:text-lg sm:text-xl">Urgent Tasks</CardTitle>
              <Button variant="link" size="sm" className="text-primary text-xs xs:text-sm">View All Tasks</Button>
            </div>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 pt-0">
            <div className="space-y-3">
              {urgentTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2.5">No urgent tasks at the moment</p>
              ) : (
                urgentTasks.map((task: any, index: number) => (
                  <div key={task.id} className="border border-border rounded-lg p-3 hover:bg-muted/50 transition-colors" data-testid={`card-urgent-task-${index}`}>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-medium text-foreground">{task.title}</h4>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        new Date(task.dueAt) < new Date() 
                          ? 'bg-destructive/10 text-destructive' 
                          : 'bg-accent/10 text-accent'
                      }`}>
                        {new Date(task.dueAt) < new Date() ? 'Overdue' : 'Due Soon'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                      <span>Candidate Name</span>
                      <span>Due: {task.dueAt ? new Date(task.dueAt).toLocaleDateString() : 'No due date'}</span>
                    </div>
                    <div className="flex items-center mt-2">
                      <div className={`w-2 h-2 rounded-full mr-2 ${
                        task.priority === 'critical' ? 'bg-destructive' :
                        task.priority === 'high' ? 'bg-chart-3' :
                        task.priority === 'medium' ? 'bg-chart-5' : 'bg-muted-foreground'
                      }`} />
                      <span className="text-xs text-muted-foreground capitalize">{task.priority} Priority</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Division Overview */}
        <Card data-testid="card-department-overview">
          <CardHeader className="p-3 sm:p-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base xs:text-lg sm:text-xl">Division Overview</CardTitle>
              <Button variant="ghost" size="sm" className="min-h-[44px]">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.707A1 1 0 013 7V4z" />
                </svg>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 pt-0">
            {!canViewDivisionOverview ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                You don’t have permission to view division insights.
              </p>
            ) : divisionOverviewError ? (
              <p className="text-sm text-destructive text-center py-4">
                Unable to load division overview. Please try again later.
              </p>
            ) : (
              <div className="space-y-3">
                {divisionOverviewItems.map((item, index) => {
                  const { Icon, bgClass, iconClass } = divisionIconConfigs[index % divisionIconConfigs.length];
                  return (
                    <div
                      key={item.key}
                      className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                      data-testid={`card-division-row-${index}`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className={`w-10 h-10 ${bgClass} rounded-lg flex items-center justify-center`}>
                          <Icon className={iconClass} />
                        </div>
                        <div className="space-y-1">
                          {item.kind === "data" ? (
                            <>
                              <h4 className="text-sm font-medium text-foreground">{item.entry.divisionName}</h4>
                              <p className="text-xs text-muted-foreground">{item.entry.departmentName || "No department assigned"}</p>
                            </>
                          ) : item.kind === "loading" ? (
                            <>
                              <Skeleton className="h-4 w-32" />
                              <Skeleton className="h-3 w-24" />
                            </>
                          ) : (
                            <>
                              <p className="text-sm font-medium text-muted-foreground">No division data</p>
                              <p className="text-xs text-muted-foreground">Awaiting active candidates</p>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="text-right min-w-[48px]">
                        {item.kind === "data" ? (
                          <>
                            <p className="text-sm font-semibold text-foreground">{item.entry.activeCandidateCount}</p>
                            <p className="text-xs text-muted-foreground">Active</p>
                          </>
                        ) : item.kind === "loading" ? (
                          <>
                            <Skeleton className="h-4 w-8 ml-auto" />
                            <Skeleton className="h-3 w-12 ml-auto mt-1" />
                          </>
                        ) : (
                          <>
                            <p className="text-sm font-semibold text-muted-foreground">—</p>
                            <p className="text-xs text-muted-foreground">Active</p>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={showNoPermission} onOpenChange={setShowNoPermission}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Insufficient Permissions</AlertDialogTitle>
            <AlertDialogDescription>
              You don’t have permission to create candidates. Please contact an administrator if you believe this is a mistake.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowNoPermission(false)}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
