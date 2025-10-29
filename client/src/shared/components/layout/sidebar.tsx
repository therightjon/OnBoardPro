import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/shared/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { 
  ChartLine, 
  Bus, 
  BookOpen, 
  UserCheck, 
  ClipboardList, 
  ChartBar, 
  Bell,
  Settings,
  Users,
  LogOut
} from "lucide-react";
import { useUnreadNotifications, UNREAD_COUNT_QUERY_KEY } from "@/features/notifications/hooks/useUnreadNotifications";
import { fetchNotifications, markNotificationRead } from "@/features/notifications/api";
import { NotificationItem } from "@/features/notifications/components/NotificationItem";
import { mapNotificationToDisplay } from "@/features/notifications/utils";
import type { NotificationRecord, NotificationsResponse } from "@/features/notifications/types";

interface SidebarProps {
  className?: string;
  onNavigate?: () => void;
}

interface NavigationItem {
  name: string;
  href: string;
  icon: LucideIcon;
  roles: string[];
}

const allNavigation: NavigationItem[] = [
  { name: "Dashboard", href: "/", icon: ChartLine, roles: ["system_admin", "hr_staff", "department_admin", "division_leader", "manager", "candidate"] },
  { name: "Candidates", href: "/candidates", icon: Bus, roles: ["system_admin", "hr_staff", "department_admin", "division_leader", "manager"] },
  { name: "Task Library", href: "/tasks", icon: BookOpen, roles: ["system_admin", "hr_staff"] },
  { name: "My Tasks", href: "/tasks/mine", icon: UserCheck, roles: ["system_admin", "hr_staff", "department_admin", "division_leader", "manager", "candidate"] },
  { name: "Templates", href: "/templates", icon: ClipboardList, roles: ["system_admin", "hr_staff"] },
  { name: "Analytics", href: "/analytics", icon: ChartBar, roles: ["system_admin", "hr_staff", "department_admin"] },
  { name: "Settings", href: "/settings", icon: Settings, roles: ["system_admin", "hr_staff", "department_admin", "division_leader", "manager", "candidate"] },
  { name: "Notifications", href: "/notifications", icon: Bell, roles: ["system_admin", "hr_staff", "department_admin", "division_leader", "manager", "candidate"] },
];

const RESET_UNREAD_ON_NAVIGATE = false;
const SIDEBAR_POPOVER_KEY = ["notifications", "sidebar-popover"] as const;

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
        // Full-height column; entire sidebar scrolls as needed
        "w-full h-full bg-card flex flex-col overflow-y-auto",
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
      
      {/* Nav sits directly above the user panel; tighter spacing */}
      <nav className="p-3 space-y-1">
        {navigation.map((item) => {
          const isActive = location === item.href || 
            (item.href !== "/" && item.href !== "/tasks" && location.startsWith(item.href));
          const testId = `nav-link-${item.name.toLowerCase().replace(/\s+/g, '-')}`;

          if (item.href === "/notifications") {
            return (
              <SidebarNotificationsLink
                key={item.name}
                item={item}
                isActive={isActive}
                onNavigate={onNavigate}
                testId={testId}
              />
            );
          }

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
              data-testid={testId}
            >
              <Icon className="w-5 h-5" />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* User panel directly below nav with tighter spacing */}
      <div className="px-3 pb-3 pt-2 border-t border-border">
        <div className="flex items-center space-x-3 mb-2">
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

interface SidebarNotificationsLinkProps {
  item: NavigationItem;
  isActive: boolean;
  onNavigate?: () => void;
  testId: string;
}

function SidebarNotificationsLink({ item, isActive, onNavigate, testId }: SidebarNotificationsLinkProps) {
  const { badgeText, showBadge, ariaLabel, rawCount } = useUnreadNotifications({ resetOnNavigate: RESET_UNREAD_ON_NAVIGATE });
  const [shouldPulse, setShouldPulse] = useState(false);
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const previousCountRef = useRef<number | undefined>(undefined);
  const queryClient = useQueryClient();
  const pendingRemovalRef = useRef<Set<string>>(new Set());

  const popoverQuery = useQuery({
    queryKey: SIDEBAR_POPOVER_KEY,
    queryFn: () => fetchNotifications({ limit: 5, unreadOnly: true }),
    enabled: open,
    staleTime: 0,
  });

  const markReadMutation = useMutation({
    mutationFn: async ({ id, isRead }: { id: string; isRead: boolean }) => {
      await markNotificationRead(id, isRead);
    },
    onSuccess: (_, variables) => {
      queryClient.setQueryData<NotificationsResponse | undefined>(SIDEBAR_POPOVER_KEY, (data) => {
        if (!data) return data;
        return {
          ...data,
          items: data.items.map((item) =>
            item.id === variables.id ? { ...item, isRead: variables.isRead } : item
          ),
        };
      });
      void queryClient.invalidateQueries({ queryKey: UNREAD_COUNT_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: SIDEBAR_POPOVER_KEY });
      void queryClient.invalidateQueries({ queryKey: ["notifications", "list"] });
    }
  });

  const markVisibleMutation = useMutation({
    mutationFn: async (visibleNotifications: NotificationRecord[]) => {
      const unreadVisible = visibleNotifications.filter((notification) => !notification.isRead);
      if (unreadVisible.length === 0) return;
      await Promise.all(
        unreadVisible.map((notification) => markNotificationRead(notification.id, true))
      );
    },
    onSuccess: (_, visibleNotifications) => {
      if (!visibleNotifications || visibleNotifications.length === 0) return;
      queryClient.setQueryData<NotificationsResponse | undefined>(SIDEBAR_POPOVER_KEY, (data) => {
        if (!data) return data;
        const readIds = new Set(visibleNotifications.map((notification) => notification.id));
        return {
          ...data,
          items: data.items.map((item) =>
            readIds.has(item.id) ? { ...item, isRead: true } : item
          ),
        };
      });
      void queryClient.invalidateQueries({ queryKey: UNREAD_COUNT_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: SIDEBAR_POPOVER_KEY });
      void queryClient.invalidateQueries({ queryKey: ["notifications", "list"] });
    }
  });

  useEffect(() => {
    if (rawCount === undefined) return;
    const previous = previousCountRef.current ?? 0;
    if (previous === 0 && rawCount > 0) {
      setShouldPulse(true);
    }
    previousCountRef.current = rawCount;
  }, [rawCount]);

  useEffect(() => {
    if (!shouldPulse) return;
    const timeout = window.setTimeout(() => setShouldPulse(false), 1500);
    return () => window.clearTimeout(timeout);
  }, [shouldPulse]);

  useEffect(() => {
    if (open) {
      setShouldPulse(false);
    }
  }, [open]);

  const notifications = popoverQuery.data?.items ?? [];
  const isLoading = popoverQuery.isLoading || popoverQuery.isFetching;
  const hasUnreadVisible = notifications.some((notification) => !notification.isRead);
  const unreadCount = rawCount ?? 0;
  const Icon = item.icon;

  const prunePopoverData = useCallback(() => {
    const toRemove = pendingRemovalRef.current;
    queryClient.setQueryData<NotificationsResponse | undefined>(SIDEBAR_POPOVER_KEY, (data) => {
      if (!data) return data;
      const filtered = data.items.filter(
        (notification) => !notification.isRead && !toRemove.has(notification.id)
      );
      if (filtered.length === data.items.length) return data;
      return { ...data, items: filtered };
    });
    if (toRemove.size > 0) {
      toRemove.clear();
    }
  }, [queryClient]);

  const closePopover = useCallback(() => {
    setOpen(false);
    prunePopoverData();
  }, [prunePopoverData]);

  const handleSelect = (notification: NotificationRecord) => {
    const display = mapNotificationToDisplay(notification);
    pendingRemovalRef.current.add(notification.id);
    markReadMutation.mutate({ id: notification.id, isRead: true });
    closePopover();
    onNavigate?.();
    if (display.link) {
      navigate(display.link);
    }
  };

  const handleViewAll = () => {
    closePopover();
    onNavigate?.();
    navigate("/notifications");
  };

  const handleMarkAllRead = () => {
    if (!hasUnreadVisible) return;
    const unreadVisible = notifications.filter((notification) => !notification.isRead);
    if (unreadVisible.length === 0) return;
    unreadVisible.forEach((notification) => pendingRemovalRef.current.add(notification.id));
    markVisibleMutation.mutate(unreadVisible);
    closePopover();
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      if (unreadCount === 0) return;
      setOpen(true);
      return;
    }
    closePopover();
  };

  const handleTriggerClick = () => {
    if (unreadCount === 0) {
      closePopover();
      onNavigate?.();
      navigate(item.href);
    }
  };

  useEffect(() => {
    if (open && unreadCount === 0) {
      closePopover();
    }
  }, [closePopover, open, unreadCount]);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={testId}
          className={cn(
            "relative flex w-full items-center space-x-3 rounded-lg px-4 py-3 text-left text-sm font-medium transition-colors",
            isActive
              ? "bg-primary text-primary-foreground"
              : "hover:bg-secondary hover:text-secondary-foreground",
            !isActive && showBadge ? "bg-destructive/10 text-sidebar-foreground" : "",
            shouldPulse ? "sidebar-unread-pulse" : ""
          )}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={handleTriggerClick}
        >
          <Icon className="w-5 h-5" />
          <span className="flex-1 truncate">{item.name}</span>
          <span
            aria-hidden
            className={cn(
              "ml-auto inline-flex h-5 min-w-[1.75rem] items-center justify-center rounded-full bg-destructive px-1 text-xs font-semibold text-destructive-foreground transition-opacity",
              showBadge ? "opacity-100" : "opacity-0"
            )}
          >
            {badgeText}
          </span>
          {ariaLabel ? (
            <span className="sr-only" aria-live="polite" role="status">
              {ariaLabel}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" sideOffset={12} className="w-80 p-0 shadow-lg">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          <Button
            variant="ghost"
            size="sm"
            disabled={markVisibleMutation.isPending || !hasUnreadVisible}
            onClick={handleMarkAllRead}
          >
            {markVisibleMutation.isPending ? "Marking..." : "Mark all read"}
          </Button>
        </div>
        <div className={notifications.length === 0 && !isLoading ? "py-6" : "py-3"}>
          {isLoading ? (
            <div className="px-4 text-sm text-muted-foreground">Loading notifications…</div>
          ) : notifications.length === 0 ? (
            <div className="px-4 text-sm text-muted-foreground">You're all caught up.</div>
          ) : (
            <div className="space-y-2 px-3">
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onSelect={handleSelect}
                  compact
                />
              ))}
            </div>
          )}
        </div>
        <div className="border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={handleViewAll}
            className="w-full text-sm font-medium text-primary hover:underline"
          >
            View all notifications
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
