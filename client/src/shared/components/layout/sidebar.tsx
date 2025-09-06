import { Link, useLocation } from "wouter";
import { Button } from "@/shared/components/ui/button";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { cn } from "@/lib/utils";
import { 
  ChartLine, 
  Bus, 
  BookOpen, 
  UserCheck, 
  ClipboardList, 
  ChartBar, 
  Settings,
  Users,
  LogOut
} from "lucide-react";

interface SidebarProps {
  className?: string;
  onNavigate?: () => void;
}

const allNavigation = [
  { name: "Dashboard", href: "/", icon: ChartLine, roles: ["system_admin", "hr_staff", "department_admin", "division_leader", "manager", "candidate"] },
  { name: "Candidates", href: "/candidates", icon: Bus, roles: ["system_admin", "hr_staff", "department_admin", "division_leader", "manager"] },
  { name: "Task Library", href: "/tasks", icon: BookOpen, roles: ["system_admin", "hr_staff"] },
  { name: "My Tasks", href: "/tasks/mine", icon: UserCheck, roles: ["system_admin", "hr_staff", "department_admin", "division_leader", "manager", "candidate"] },
  { name: "Templates", href: "/templates", icon: ClipboardList, roles: ["system_admin", "hr_staff"] },
  { name: "Analytics", href: "/analytics", icon: ChartBar, roles: ["system_admin", "hr_staff", "department_admin"] },
  { name: "Settings", href: "/settings", icon: Settings, roles: ["system_admin", "hr_staff", "department_admin", "division_leader", "manager", "candidate"] },
];

export function Sidebar({ className, onNavigate }: SidebarProps) {
  const [location] = useLocation();
  const { user, logoutMutation } = useAuth();

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  if (!user) return null;

  // Filter navigation items based on user role
  const navigation = allNavigation.filter(item => item.roles.includes(user.role));

  return (
    <div 
      className={cn(
        "w-full h-full bg-card flex flex-col",
        className
      )}
      data-testid="sidebar"
    >
      <div className="p-6 border-b border-border">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <Users className="text-primary-foreground text-lg" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground" data-testid="text-app-title">OnboardPro</h1>
            <p className="text-sm text-muted-foreground">Hiring & Onboarding</p>
          </div>
        </div>
      </div>
      
      <nav className="p-4 space-y-2 flex-1">
        {navigation.map((item) => {
          const isActive = location === item.href || 
            (item.href !== "/" && item.href !== "/tasks" && location.startsWith(item.href));
          const Icon = item.icon;
          
          return (
            <Link 
              key={item.name} 
              href={item.href}
              className={cn(
                "flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors w-full",
                isActive 
                  ? "bg-primary text-primary-foreground" 
                  : "hover:bg-secondary hover:text-secondary-foreground"
              )}
              onClick={onNavigate}
              data-testid={`nav-link-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <Icon className="w-5 h-5" />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-border">
        <div className="flex items-center space-x-3 mb-3">
          <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
            <span className="text-primary-foreground text-sm font-medium" data-testid="text-user-initials">
              {((user.firstName || '').charAt(0) + (user.lastName || '').charAt(0)).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate" data-testid="text-user-name">{user.firstName} {user.lastName}</p>
            <p className="text-xs text-muted-foreground truncate capitalize" data-testid="text-user-role">
              {user.role.replace('_', ' ')}
            </p>
          </div>
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          className="w-full justify-start text-muted-foreground hover:text-foreground"
          onClick={handleLogout}
          disabled={logoutMutation.isPending}
          data-testid="button-logout"
        >
          <LogOut className="w-4 h-4 mr-2" />
          {logoutMutation.isPending ? "Signing out..." : "Sign Out"}
        </Button>
      </div>
    </div>
  );
}
