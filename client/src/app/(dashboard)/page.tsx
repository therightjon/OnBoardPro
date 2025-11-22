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
import type { LucideIcon } from "lucide-react";
import { useLocation } from "wouter";
import { ReactNode, useMemo, useState } from "react";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useMyTasks } from "@/features/tasks/hooks/use-my-tasks";
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
import type { CandidateTask, CandidateType } from "@shared/schemas";

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

type RecentActivityEvent = {
  id: string;
  type: "candidate_created" | "task_completed" | "candidate_stage_changed" | "template_applied";
  candidateId: string | null;
  candidateFirstName: string | null;
  candidateLastName: string | null;
  candidateTypeName: string | null;
  occurredAt: string;
  taskTitle?: string | null;
  stageName?: string | null;
  templateName?: string | null;
};

type ActivityVisualConfig = {
  icon: LucideIcon;
  iconWrapperClass: string;
  iconClass: string;
  badgeVariant?: "default" | "secondary" | "outline" | "destructive";
  badgeClassName?: string;
  badgeText: string;
};

const RECENT_ACTIVITY_VISUALS: Record<RecentActivityEvent["type"], ActivityVisualConfig> = {
  candidate_created: {
    icon: UserPlus,
    iconWrapperClass: "bg-accent/10",
    iconClass: "text-accent",
    badgeVariant: "secondary",
    badgeText: "New"
  },
  task_completed: {
    icon: CheckCircle,
    iconWrapperClass: "bg-primary/10",
    iconClass: "text-primary",
    badgeVariant: "secondary",
    badgeClassName: "bg-primary/10 text-primary border-primary/30",
    badgeText: "Completed"
  },
  candidate_stage_changed: {
    icon: ArrowRight,
    iconWrapperClass: "bg-chart-3/10",
    iconClass: "text-chart-3",
    badgeVariant: "outline",
    badgeText: "Stage"
  },
  template_applied: {
    icon: ClipboardList,
    iconWrapperClass: "bg-chart-2/10",
    iconClass: "text-chart-2",
    badgeVariant: "secondary",
    badgeText: "Template"
  }
};

const getFullName = (first?: string | null, last?: string | null): string => {
  const parts = [first, last].filter((part): part is string => Boolean(part && part.trim()));
  return parts.join(" ");
};

const formatActivityTitle = (activity: RecentActivityEvent): string => {
  const fullName = getFullName(activity.candidateFirstName, activity.candidateLastName);
  switch (activity.type) {
    case "candidate_created":
      return fullName ? `New candidate ${fullName} added` : "New candidate added";
    case "task_completed":
      return `Task completed: ${activity.taskTitle || "Task"}`;
    case "candidate_stage_changed":
      return `${fullName || "Candidate"} moved to ${activity.stageName || "new stage"}`;
    case "template_applied":
    default:
      return activity.templateName ? `Template applied: ${activity.templateName}` : "Template applied";
  }
};

const getActivityDetailText = (activity: RecentActivityEvent): string => {
  const fullName = getFullName(activity.candidateFirstName, activity.candidateLastName);
  if (activity.type === "task_completed" || activity.type === "template_applied") {
    return fullName || activity.candidateTypeName || "Candidate update";
  }
  return activity.candidateTypeName || fullName || "Candidate update";
};

type StatusTone = "primary" | "success" | "warning" | "danger" | "muted" | "info";

const STATUS_PILL_TONES: Record<StatusTone, string> = {
  primary: "bg-primary/10 text-primary border-primary/30",
  success: "bg-emerald-500/10 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-100 dark:border-emerald-500/40",
  warning: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/10 dark:text-amber-50 dark:border-amber-500/40",
  danger: "bg-destructive/10 text-destructive border-destructive/30",
  muted: "bg-muted/70 text-muted-foreground border-border",
  info: "bg-accent/10 text-accent border-accent/30"
};

const normalizeStatusKey = (status?: string | null) =>
  (status ?? "").toString().trim().toLowerCase().replace(/\s+/g, "_");

const statusLabel = (status?: string | null, overrideLabel?: string) => {
  if (overrideLabel) return overrideLabel;
  if (!status) return "Unknown";
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const getStatusToneForStatus = (status?: string | null): StatusTone => {
  const key = normalizeStatusKey(status);
  switch (key) {
    case "active":
    case "new":
    case "stage":
    case "template":
      return "primary";
    case "completed":
      return "success";
    case "on_hold":
    case "pending":
      return "warning";
    case "overdue":
    case "canceled":
      return "danger";
    case "due_soon":
      return "info";
    case "draft":
    case "archived":
    default:
      return "muted";
  }
};

const parseDueDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
};

const StatusPill = ({
  status,
  tone,
  label
}: {
  status?: string | null;
  tone?: StatusTone;
  label?: string;
}) => {
  const computedTone = tone ?? getStatusToneForStatus(status);
  return (
    <Badge
      variant="secondary"
      className={`shrink-0 ${STATUS_PILL_TONES[computedTone]}`}
    >
      {statusLabel(status, label)}
    </Badge>
  );
};

type DashboardListRowProps = {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  status?: string | null;
  statusTone?: StatusTone;
  statusContent?: ReactNode;
  metaLeft?: ReactNode;
  metaRight?: ReactNode;
  onClick?: () => void;
  testId?: string;
};

const DashboardListRow = ({
  leading,
  title,
  subtitle,
  status,
  statusTone,
  statusContent,
  metaLeft,
  metaRight,
  onClick,
  testId
}: DashboardListRowProps) => {
  const Component = onClick ? "button" : "div";
  const resolvedStatus = statusContent ?? (status ? <StatusPill status={status} tone={statusTone} /> : null);

  return (
    <Component
      type={onClick ? "button" : undefined}
      onClick={onClick}
      data-testid={testId}
      className={`w-full text-left rounded-xl border border-border/70 p-3 sm:p-3.5 min-h-[86px] hover:border-primary/40 hover:bg-muted/50 transition-colors ${
        onClick ? "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        {leading ? <div className="flex-shrink-0">{leading}</div> : null}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-semibold text-foreground truncate">{title}</p>
              {subtitle ? <p className="text-xs text-muted-foreground truncate">{subtitle}</p> : null}
            </div>
            {resolvedStatus ? <div className="shrink-0">{resolvedStatus}</div> : null}
          </div>
          {(metaLeft || metaRight) && (
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {metaLeft ? <div className="min-w-0 truncate">{metaLeft}</div> : null}
              {metaRight ? <div className="flex items-center gap-2 text-right">{metaRight}</div> : null}
            </div>
          )}
        </div>
      </div>
    </Component>
  );
};

const DashboardListRowSkeleton = () => (
  <div className="rounded-xl border border-border/70 p-3 sm:p-3.5 min-h-[86px]">
    <div className="flex items-center gap-3">
      <Skeleton className="w-10 h-10 rounded-full" />
      <div className="flex-1 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-1 min-w-0">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
    </div>
  </div>
);

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

  const { data: tasks = [] } = useMyTasks();

  const { data: candidateTypes = [] } = useQuery<CandidateType[]>({
    queryKey: ["/api/candidate-types", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const res = await fetch('/api/candidate-types', { credentials: 'include' });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    }
  });

  const { data: recentActivity = [], isLoading: recentActivityLoading, isError: recentActivityError } = useQuery<RecentActivityEvent[]>({
    queryKey: ["/api/dashboard/recent-activity", 4, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const res = await fetch('/api/dashboard/recent-activity?limit=4', { credentials: 'include' });
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
  const tasksDue = tasks.filter((t: CandidateTask) => {
    const dueDate = parseDueDate(t.dueAt);
    if (!dueDate) return false;
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    return dueDate <= sevenDaysFromNow && t.status !== "done";
  }).length;
  const overdueTasks = tasks.filter((t: CandidateTask) => {
    const dueDate = parseDueDate(t.dueAt);
    if (!dueDate) return false;
    return dueDate < new Date() && t.status !== "done";
  }).length;
  const completedTasks = tasks.filter((t: CandidateTask) => t.status === "done").length;
  const totalTasks = tasks.length;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const urgentTasks = useMemo(() => {
    const now = new Date();
    const excludedStatuses = new Set(["done", "completed", "canceled"]);

    return tasks
      .map((task: CandidateTask) => {
        const dueDate = parseDueDate(task.dueAt);
        const statusKey = normalizeStatusKey(task.status);
        const isOverdue = (dueDate ? dueDate < now : false) || statusKey === "overdue";
        return { task, dueDate, isOverdue, statusKey };
      })
      .filter(({ statusKey, isOverdue }) => isOverdue && !excludedStatuses.has(statusKey))
      .sort((a, b) => {
        const aTime = a.dueDate ? a.dueDate.getTime() : Number.POSITIVE_INFINITY;
        const bTime = b.dueDate ? b.dueDate.getTime() : Number.POSITIVE_INFINITY;
        return aTime - bTime;
      })
      .slice(0, 4);
  }, [tasks]);

  const handleUrgentTaskClick = (task: CandidateTask) => {
    if (task?.candidateId) {
      setLocation(`/candidates/${task.candidateId}`);
      return;
    }
    setLocation('/tasks/mine');
  };

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
                  <DashboardListRow
                    key={candidate.id}
                    leading={
                      <Avatar className="h-10 w-10 border border-border/70">
                        <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                          {getInitials(candidate.firstName, candidate.lastName)}
                        </AvatarFallback>
                      </Avatar>
                    }
                    title={`${candidate.firstName} ${candidate.lastName}`}
                    status={candidate.status}
                    metaLeft={<p className="text-muted-foreground truncate">{getCandidateTypeName(candidate.candidateTypeId)}</p>}
                    metaRight={
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Clock className="w-3.5 h-3.5 text-primary" />
                        <span className="font-medium text-foreground">{format(candidate.startDate, "MMM d, yyyy")}</span>
                        <span className="text-muted-foreground">{formatDistanceToNow(candidate.startDate, { addSuffix: true })}</span>
                      </div>
                    }
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="flex flex-col" data-testid="card-recent-activity">
          <CardHeader className="p-3 sm:p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
              <CardTitle className="text-base xs:text-lg sm:text-xl">Recent Activity</CardTitle>
              <p className="hidden xs:block text-xs text-muted-foreground mt-1">Recent actions and updates</p>
              </div>
              <div className="min-h-[44px] gap-1.5 text-xs xs:text-sm">
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 pt-0 max-w-full">
            {recentActivityLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <DashboardListRowSkeleton key={index} />
                ))}
              </div>
            ) : recentActivityError ? (
              <div className="text-sm text-destructive text-center py-6">
                Unable to load recent activity.
              </div>
            ) : recentActivity.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-6">
                No recent activity yet.
              </div>
            ) : (
              <div className="space-y-3">
                {recentActivity.slice(0, 4).map((activity) => {
                  const config = RECENT_ACTIVITY_VISUALS[activity.type] ?? RECENT_ACTIVITY_VISUALS.candidate_created;
                  const timestamp = activity.occurredAt ? new Date(activity.occurredAt) : null;
                  const hasValidDate = Boolean(timestamp && !Number.isNaN(timestamp.getTime()));
                  const formattedDate = hasValidDate ? format(timestamp!, "MMM d, yyyy") : "Date pending";
                  const relativeTime = hasValidDate ? formatDistanceToNow(timestamp!, { addSuffix: true }) : "Just now";
                  const detailText = getActivityDetailText(activity);
                  const title = formatActivityTitle(activity);
                  return (
                    <DashboardListRow
                      key={activity.id}
                      leading={
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${config.iconWrapperClass}`}>
                          <config.icon className={`w-4 h-4 ${config.iconClass}`} />
                        </div>
                      }
                      title={title}
                      metaLeft={<p className="truncate">{detailText}</p>}
                      statusContent={
                        <Badge
                          variant={config.badgeVariant ?? "secondary"}
                          className={`shrink-0 ${config.badgeClassName ?? ""}`.trim()}
                        >
                          {config.badgeText}
                        </Badge>
                      }
                      metaRight={
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-primary" />
                          <span className="font-medium text-foreground">{formattedDate}</span>
                          <span className="text-xs text-muted-foreground">{relativeTime}</span>
                        </div>
                      }
                    />
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions and Tasks Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 md:gap-6">
        {/* Urgent Tasks */}
        <Card data-testid="card-urgent-tasks" datat-testid="card-urgent-tasks">
          <CardHeader className="p-3 sm:p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
              <CardTitle className="text-base xs:text-lg sm:text-xl">Urgent Tasks</CardTitle>
                <p className="hidden xs:block text-xs text-muted-foreground mt-1">Critical and overdue tasks</p>
                </div>
              <Button
                variant="ghost"
                size="sm"
                className="min-h-[44px] gap-1.5 text-xs xs:text-sm"
                onClick={() => setLocation('/tasks/mine')}
              >
                View All
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 pt-0">
            <div className="space-y-3">
              {urgentTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-2.5">No urgent tasks at the moment</p>
              ) : (
                urgentTasks.map(({ task, dueDate, isOverdue }: { task: CandidateTask; dueDate: Date | null; isOverdue: boolean }, index: number) => {
                  const candidateName = [task.candidate?.firstName, task.candidate?.lastName].filter(Boolean).join(" ") || "Unknown Candidate";
                  const candidateTypeLabel = task.candidate?.candidateTypeId ? getCandidateTypeName(task.candidate.candidateTypeId) : null;
                  const dueLabel = dueDate ? dueDate.toLocaleDateString() : "No due date";
                  return (
                    <DashboardListRow
                      key={task.id}
                      onClick={() => handleUrgentTaskClick(task)}
                      testId={`card-urgent-task-${index}`}
                      leading={
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isOverdue ? "bg-destructive/10 text-destructive" : "bg-accent/10 text-accent"}`}>
                          <Clock className="w-4 h-4" />
                        </div>
                      }
                      title={task.title}
                      subtitle={candidateName}
                      status="Overdue"
                      statusTone="danger"
                      metaLeft={<span className="truncate">{candidateTypeLabel ?? "Candidate"}</span>}
                      metaRight={
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Clock className="w-3.5 h-3.5 text-primary" />
                          <span className="font-medium text-foreground">Due: {dueLabel}</span>
                          <div className="flex items-center gap-1">
                            <div className={`w-2 h-2 rounded-full ${
                              task.priority === 'critical' ? 'bg-destructive' :
                              task.priority === 'high' ? 'bg-chart-3' :
                              task.priority === 'medium' ? 'bg-chart-5' : 'bg-muted-foreground'
                            }`} />
                            <span className="capitalize text-muted-foreground">{task.priority} Priority</span>
                          </div>
                        </div>
                      }
                    />
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        {/* Division Overview */}
        <Card className="flex flex-col" data-testid="card-department-overview">
          <CardHeader className="p-3 sm:p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle className="text-base xs:text-lg sm:text-xl">Division Overview</CardTitle>
                <p className="hidden xs:block text-xs text-muted-foreground mt-1">Active candidates per division</p>
              </div>
              <div className="min-h-[44px] gap-1.5 text-xs xs:text-sm">
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 pt-0 flex-1">
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
                    item.kind === "loading" ? (
                      <DashboardListRowSkeleton key={item.key} />
                    ) : (
                      <DashboardListRow
                        key={item.key}
                        testId={`card-division-row-${index}`}
                        leading={
                          <div className={`w-10 h-10 ${bgClass} rounded-lg flex items-center justify-center`}>
                            <Icon className={`${iconClass} w-5 h-5`} />
                          </div>
                        }
                        title={
                          item.kind === "data"
                            ? item.entry.divisionName
                            : "No division data"
                        }
                        subtitle={
                          item.kind === "data"
                            ? item.entry.departmentName || "No department assigned"
                            : "Awaiting active candidates"
                        }
                        statusContent={
                          <div className="flex items-center gap-2">
                            {item.kind === "data" ? (
                              <span className="text-sm font-semibold text-foreground">{item.entry.activeCandidateCount}</span>
                            ) : null}
                            <StatusPill status={item.kind === "data" ? "Active" : "Pending"} statusTone={item.kind === "data" ? "primary" : "muted"} />
                          </div>
                        }
                        metaLeft={
                          item.kind === "data" ? (
                            <span className="text-muted-foreground">Active candidates</span>
                          ) : (
                            <span className="text-muted-foreground">No active candidates yet</span>
                          )
                        }
                      />
                    )
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
