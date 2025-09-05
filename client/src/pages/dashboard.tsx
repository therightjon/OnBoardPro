import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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

export default function Dashboard() {
  const { data: candidates = [] } = useQuery<any[]>({
    queryKey: ["/api/candidates"],
  });

  const { data: tasks = [] } = useQuery<any[]>({
    queryKey: ["/api/tasks/dashboard"],
  });

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

  return (
    <div className="space-y-4 xs:space-y-5 sm:space-y-6">
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
          <Button size="sm" className="min-h-[44px] px-3 xs:px-4" data-testid="button-new-candidate">
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
        {/* Stage Distribution Chart */}
        <Card className="lg:col-span-2" data-testid="card-stage-distribution">
          <CardHeader className="p-3 xs:p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base xs:text-lg sm:text-xl">Hiring Stage Distribution</CardTitle>
              <Button variant="ghost" size="sm" className="min-h-[44px]">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                </svg>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-3 xs:p-4 sm:p-6 pt-0">
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">LOI</span>
                  <span className="text-sm text-muted-foreground">8 candidates</span>
                </div>
                <Progress value={33} className="h-2" />
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">Offer</span>
                  <span className="text-sm text-muted-foreground">6 candidates</span>
                </div>
                <Progress value={25} className="h-2" />
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">Admin Processing</span>
                  <span className="text-sm text-muted-foreground">5 candidates</span>
                </div>
                <Progress value={21} className="h-2" />
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">Credentialing</span>
                  <span className="text-sm text-muted-foreground">3 candidates</span>
                </div>
                <Progress value={13} className="h-2" />
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">Onboarding</span>
                  <span className="text-sm text-muted-foreground">2 candidates</span>
                </div>
                <Progress value={8} className="h-2" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card data-testid="card-recent-activity">
          <CardHeader className="p-3 xs:p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base xs:text-lg sm:text-xl">Recent Activity</CardTitle>
              <Button variant="link" size="sm" className="text-primary text-xs xs:text-sm">View All</Button>
            </div>
          </CardHeader>
          <CardContent className="p-3 xs:p-4 sm:p-6 pt-0">
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-accent/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <UserPlus className="text-accent text-sm" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">New candidate <span className="font-medium">Sarah Johnson</span> added</p>
                  <p className="text-xs text-muted-foreground">2 hours ago</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <CheckCircle className="text-primary text-sm" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">Task completed: <span className="font-medium">Background Check</span></p>
                  <p className="text-xs text-muted-foreground">4 hours ago</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-chart-3/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <ArrowRight className="text-chart-3 text-sm" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground"><span className="font-medium">Michael Chen</span> moved to Offer stage</p>
                  <p className="text-xs text-muted-foreground">6 hours ago</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-destructive/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <CircleAlert className="text-destructive text-sm" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">Task overdue: <span className="font-medium">Reference Check</span></p>
                  <p className="text-xs text-muted-foreground">1 day ago</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <div className="w-8 h-8 bg-chart-2/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <ClipboardList className="text-chart-2 text-sm" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">Template applied: <span className="font-medium">Faculty - Base</span></p>
                  <p className="text-xs text-muted-foreground">2 days ago</p>
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
          <CardHeader className="p-3 xs:p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base xs:text-lg sm:text-xl">Urgent Tasks</CardTitle>
              <Button variant="link" size="sm" className="text-primary text-xs xs:text-sm">View All Tasks</Button>
            </div>
          </CardHeader>
          <CardContent className="p-3 xs:p-4 sm:p-6 pt-0">
            <div className="space-y-4">
              {urgentTasks.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No urgent tasks at the moment</p>
              ) : (
                urgentTasks.map((task: any, index: number) => (
                  <div key={task.id} className="border border-border rounded-lg p-4 hover:bg-muted/50 transition-colors" data-testid={`card-urgent-task-${index}`}>
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

        {/* Department Overview */}
        <Card data-testid="card-department-overview">
          <CardHeader className="p-3 xs:p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base xs:text-lg sm:text-xl">Department Overview</CardTitle>
              <Button variant="ghost" size="sm" className="min-h-[44px]">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.707A1 1 0 013 7V4z" />
                </svg>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-3 xs:p-4 sm:p-6 pt-0">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Stethoscope className="text-primary" />
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-foreground">Cardiology</h4>
                    <p className="text-xs text-muted-foreground">Clinical Department</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-foreground">8</p>
                  <p className="text-xs text-muted-foreground">Active</p>
                </div>
              </div>
              
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-chart-2/10 rounded-lg flex items-center justify-center">
                    <UserRound className="text-chart-2" />
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-foreground">Emergency Medicine</h4>
                    <p className="text-xs text-muted-foreground">Clinical Department</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-foreground">6</p>
                  <p className="text-xs text-muted-foreground">Active</p>
                </div>
              </div>
              
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-chart-3/10 rounded-lg flex items-center justify-center">
                    <Laptop className="text-chart-3" />
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-foreground">Information Technology</h4>
                    <p className="text-xs text-muted-foreground">Administrative Department</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-foreground">4</p>
                  <p className="text-xs text-muted-foreground">Active</p>
                </div>
              </div>
              
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-chart-4/10 rounded-lg flex items-center justify-center">
                    <UsersIcon className="text-chart-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-foreground">Human Resources</h4>
                    <p className="text-xs text-muted-foreground">Administrative Department</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-foreground">6</p>
                  <p className="text-xs text-muted-foreground">Active</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
