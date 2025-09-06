import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Settings as SettingsIcon, 
  Building, 
  Users, 
  Palette, 
  Plus, 
  Edit, 
  Archive,
  Moon,
  Sun,
  Monitor,
  Target,
  Shield
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/components/layout/theme-provider";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const departmentSchema = z.object({
  name: z.string().min(1, "Name is required"),
});

const divisionSchema = z.object({
  name: z.string().min(1, "Name is required"),
  departmentId: z.string().min(1, "Department is required"),
});

const hiringStageSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  orderIndex: z.number().min(0, "Order must be 0 or greater").optional(),
  isActive: z.boolean().optional(),
});

const userSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Valid email is required"),
  passwordHash: z.string().optional(),
  role: z.string().min(1, "Role is required"),
  status: z.string().min(1, "Status is required"),
  departmentId: z.string().min(1, "Department is required"),
  divisionId: z.string().min(1, "Division is required"),
  roles: z.array(z.string()).optional(),
});

const createUserSchema = userSchema.extend({
  passwordHash: z.string().min(6, "Password must be at least 6 characters"),
});

const editUserSchema = userSchema.extend({
  passwordHash: z.string().min(6, "Password must be at least 6 characters").or(z.literal("")),
});

type DepartmentForm = z.infer<typeof departmentSchema>;
type DivisionForm = z.infer<typeof divisionSchema>;
type HiringStageForm = z.infer<typeof hiringStageSchema>;
type UserForm = z.infer<typeof userSchema>;

// Authentication Providers Card Component
function AuthenticationProvidersCard() {
  const { toast } = useToast();

  const { data: providers = [], isLoading, error } = useQuery({
    queryKey: ["/api/auth/providers"],
  });

  const toggleProviderMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      return await apiRequest(`/api/auth/providers/${id}`, {
        method: "PATCH",
        body: { enabled },
      });
    },
    onSuccess: (data, variables) => {
      toast({
        title: "Provider updated",
        description: `${data.name} has been ${variables.enabled ? 'enabled' : 'disabled'}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/providers"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error updating provider",
        description: error.message || "Failed to update authentication provider",
        variant: "destructive",
      });
    },
  });

  const handleToggleProvider = (id: string, currentEffectiveEnabled: boolean) => {
    toggleProviderMutation.mutate({ id, enabled: !currentEffectiveEnabled });
  };

  const getStatusBadge = (provider: any) => {
    if (!provider.configured) {
      return <Badge variant="destructive" data-testid={`status-${provider.id}`}>Not Configured</Badge>;
    } else if (provider.effectiveEnabled) {
      return <Badge variant="default" className="bg-green-600" data-testid={`status-${provider.id}`}>Active</Badge>;
    } else {
      return <Badge variant="secondary" data-testid={`status-${provider.id}`}>Disabled</Badge>;
    }
  };


  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Shield className="w-4 h-4 mr-2" />
            Authentication Providers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-destructive">Failed to load authentication providers</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Shield className="w-4 h-4 mr-2" />
          Authentication Providers
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Manage authentication methods available to users. At least one provider must be enabled and configured.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Configuration</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {providers.map((provider: any) => (
                <TableRow key={provider.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium" data-testid={`provider-name-${provider.id}`}>
                        {provider.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {provider.notes}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(provider)}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      {provider.configured ? (
                        <div className="text-sm space-y-1">
                          {provider.clientIdMasked && (
                            <p className="text-muted-foreground">
                              Client ID: {provider.clientIdMasked}
                            </p>
                          )}
                          {provider.callbackUrl && (
                            <p className="text-muted-foreground">
                              Callback: {provider.callbackUrl}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Missing required environment variables
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={provider.effectiveEnabled}
                      disabled={!provider.canEnable || toggleProviderMutation.isPending}
                      onCheckedChange={() => handleToggleProvider(provider.id, provider.effectiveEnabled)}
                      data-testid={`switch-${provider.id}`}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [isDepartmentDialogOpen, setIsDepartmentDialogOpen] = useState(false);
  const [isDivisionDialogOpen, setIsDivisionDialogOpen] = useState(false);
  const [isHiringStageDialogOpen, setIsHiringStageDialogOpen] = useState(false);
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [isDisableDialogOpen, setIsDisableDialogOpen] = useState(false);
  const [editingHiringStage, setEditingHiringStage] = useState<any>(null);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [disablingUser, setDisablingUser] = useState<any>(null);
  const [reassignTo, setReassignTo] = useState<string>("");
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [userStatusFilter, setUserStatusFilter] = useState<string>("all");
  const [userRoleFilter, setUserRoleFilter] = useState<string>("all");
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();

  // Check if user can manage hiring stages and users
  const canManageHiringStages = user?.role === "system_admin" || user?.role === "hr_staff";
  const canManageUsers = user?.role === "system_admin" || user?.role === "hr_staff";
  const canManageAuthProviders = user?.role === "system_admin" || user?.role === "hr_staff";

  const { data: departments = [], isLoading: departmentsLoading } = useQuery({
    queryKey: ["/api/departments"],
  });

  const { data: divisions = [], isLoading: divisionsLoading } = useQuery({
    queryKey: ["/api/divisions"],
  });

  const { data: hiringStages = [], isLoading: hiringStagesLoading } = useQuery({
    queryKey: ["/api/hiring-stages"],
    enabled: canManageHiringStages, // Only fetch if user has permission
  });

  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ["/api/users"],
    enabled: canManageUsers, // Only fetch if user has permission
  });

  const { data: userTaskCount } = useQuery({
    queryKey: ["/api/users", disablingUser?.id, "task-count"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/users/${disablingUser.id}/task-count`);
      return res.json();
    },
    enabled: !!disablingUser?.id,
  });

  const roleBadgeBase =
    "rounded-sm font-medium transition-colors shadow-none";

  // Softer (pastel) backgrounds in light mode, translucent deep hues in dark mode.
  // Hover subtly increases tint; keeps good contrast in both themes.
  const getRoleBadgeColor = (role: string) => {
    const map: Record<string, string> = {
      system_admin:
        "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800 hover:bg-red-200/60 dark:hover:bg-red-800/50",
      hr_staff:
        "bg-sky-100 dark:bg-sky-900/30 text-sky-800 dark:text-sky-200 border border-sky-200 dark:border-sky-800 hover:bg-sky-200/60 dark:hover:bg-sky-800/50",
      department_admin:
        "bg-violet-100 dark:bg-violet-900/30 text-violet-800 dark:text-violet-200 border border-violet-200 dark:border-violet-800 hover:bg-violet-200/60 dark:hover:bg-violet-800/50",
      division_leader:
        "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-200/60 dark:hover:bg-emerald-800/50",
      manager:
        "bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800 hover:bg-amber-200/60 dark:hover:bg-amber-800/50",
      candidate:
        "bg-slate-100 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-200/60 dark:hover:bg-slate-700",
      default:
        "bg-neutral-100 dark:bg-neutral-800/40 text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-200/60 dark:hover:bg-neutral-700"
    };
    return `${roleBadgeBase} ${map[role] || map.default}`;
  };

  const createDepartmentMutation = useMutation({
    mutationFn: async (data: DepartmentForm) => {
      const res = await apiRequest("POST", "/api/departments", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/departments"] });
      setIsDepartmentDialogOpen(false);
      departmentForm.reset();
      toast({
        title: "Success",
        description: "Department created successfully",
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

  const createDivisionMutation = useMutation({
    mutationFn: async (data: DivisionForm) => {
      const res = await apiRequest("POST", "/api/divisions", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/divisions"] });
      setIsDivisionDialogOpen(false);
      divisionForm.reset();
      toast({
        title: "Success",
        description: "Division created successfully",
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

  const createHiringStageMutation = useMutation({
    mutationFn: async (data: HiringStageForm) => {
      const res = await apiRequest("POST", "/api/hiring-stages", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hiring-stages"] });
      setIsHiringStageDialogOpen(false);
      setEditingHiringStage(null);
      hiringStageForm.reset();
      toast({
        title: "Success",
        description: "Hiring stage created successfully",
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

  const updateHiringStageMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<HiringStageForm> }) => {
      const res = await apiRequest("PATCH", `/api/hiring-stages/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hiring-stages"] });
      setIsHiringStageDialogOpen(false);
      setEditingHiringStage(null);
      hiringStageForm.reset();
      toast({
        title: "Success",
        description: "Hiring stage updated successfully",
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

  const deleteHiringStageMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/hiring-stages/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hiring-stages"] });
      toast({
        title: "Success",
        description: "Hiring stage deleted successfully",
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

  const createUserMutation = useMutation({
    mutationFn: async (data: UserForm) => {
      const res = await apiRequest("POST", "/api/users", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setIsUserDialogOpen(false);
      setEditingUser(null);
      userForm.reset();
      toast({
        title: "Success",
        description: "User created successfully",
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

  const updateUserMutation = useMutation({
    mutationFn: async (data: UserForm & { id: string }) => {
      const { id, ...updateData } = data;
      const res = await apiRequest("PATCH", `/api/users/${id}`, updateData);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setIsUserDialogOpen(false);
      setEditingUser(null);
      userForm.reset();
      toast({
        title: "Success",
        description: "User updated successfully",
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

  const disableUserMutation = useMutation({
    mutationFn: async ({ userId, reassignOpenTasksTo }: { userId: string; reassignOpenTasksTo?: string }) => {
      const res = await apiRequest("POST", `/api/users/${userId}/disable`, { reassignOpenTasksTo });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setIsDisableDialogOpen(false);
      setDisablingUser(null);
      setReassignTo("");
      toast({
        title: "User disabled",
        description: data.tasksReassigned 
          ? `User disabled successfully. ${data.tasksReassigned} task(s) reassigned.`
          : "User disabled successfully.",
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

  const enableUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("POST", `/api/users/${userId}/enable`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Success",
        description: "User enabled successfully",
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

  const departmentForm = useForm<DepartmentForm>({
    resolver: zodResolver(departmentSchema),
    defaultValues: {
      name: "",
    },
  });

  const divisionForm = useForm<DivisionForm>({
    resolver: zodResolver(divisionSchema),
    defaultValues: {
      name: "",
      departmentId: "",
    },
  });

  const hiringStageForm = useForm<HiringStageForm>({
    resolver: zodResolver(hiringStageSchema),
    defaultValues: {
      name: "",
      description: "",
      orderIndex: 0,
      isActive: true,
    },
  });

  const userForm = useForm<UserForm>({
    resolver: zodResolver(editingUser ? editUserSchema : createUserSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      passwordHash: "",
      role: "",
      status: "active",
      departmentId: undefined,
      divisionId: undefined,
      roles: []
    },
  });

  const getDepartmentName = (departmentId: string) => {
    const department = departments.find((d: any) => d.id === departmentId);
    return department?.name || "Unknown";
  };

  const onDepartmentSubmit = (data: DepartmentForm) => {
    createDepartmentMutation.mutate(data);
  };

  const onDivisionSubmit = (data: DivisionForm) => {
    createDivisionMutation.mutate(data);
  };

  const onHiringStageSubmit = (data: HiringStageForm) => {
    if (editingHiringStage) {
      updateHiringStageMutation.mutate({ id: editingHiringStage.id, data });
    } else {
      createHiringStageMutation.mutate(data);
    }
  };

  const handleEditHiringStage = (stage: any) => {
    setEditingHiringStage(stage);
    hiringStageForm.reset({
      name: stage.name,
      description: stage.description || "",
      orderIndex: stage.orderIndex,
      isActive: stage.isActive,
    });
    setIsHiringStageDialogOpen(true);
  };

  const handleNewHiringStage = () => {
    setEditingHiringStage(null);
    hiringStageForm.reset({
      name: "",
      description: "",
      orderIndex: 0,
      isActive: true,
    });
    setIsHiringStageDialogOpen(true);
  };

  const onUserSubmit = (data: UserForm) => {
    if (editingUser) {
      // Remove password from update data if it's empty (keep current password)
      const updateData = { ...data };
      if (!updateData.passwordHash || updateData.passwordHash.trim() === "") {
        delete updateData.passwordHash;
      }
      updateUserMutation.mutate({ id: editingUser.id, ...updateData });
    } else {
      createUserMutation.mutate(data);
    }
  };

  const handleEditUser = (user: any) => {
    setEditingUser(user);
    userForm.reset({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      passwordHash: "", // Don't pre-fill password
      role: user.role,
      status: user.status,
      departmentId: user.departmentId || undefined,
      divisionId: user.divisionId || undefined,
      roles: []
    });
    // Update resolver for edit mode
    userForm.clearErrors();
    setIsUserDialogOpen(true);
  };

  const handleNewUser = () => {
    setEditingUser(null);
    userForm.reset({
      firstName: "",
      lastName: "",
      email: "",
      passwordHash: "",
      role: "",
      status: "active",
      departmentId: undefined,
      divisionId: undefined,
      roles: []
    });
    // Update resolver for create mode
    userForm.clearErrors();
    setIsUserDialogOpen(true);
  };

  const handleDisableUser = (user: any) => {
    setDisablingUser(user);
    setReassignTo("");
    setIsDisableDialogOpen(true);
  };

  const handleEnableUser = (user: any) => {
    enableUserMutation.mutate(user.id);
  };

  const handleConfirmDisable = () => {
    if (disablingUser) {
      disableUserMutation.mutate({
        userId: disablingUser.id,
        reassignOpenTasksTo: reassignTo === "unassigned" ? undefined : reassignTo || undefined
      });
    }
  };

  // Get active users for reassignment (excluding the user being disabled)
  const reassignableUsers = users.filter((u: any) => 
    u.status === 'active' && u.id !== disablingUser?.id
  );

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" data-testid="text-settings-title">Settings</h1>
          <p className="text-muted-foreground">Manage your application preferences and organization structure</p>
        </div>
      </div>

      <Tabs defaultValue="appearance" className="w-full">
        <TabsList className={`grid w-full ${(canManageHiringStages && canManageUsers && canManageAuthProviders) ? 'grid-cols-6' : (canManageHiringStages && canManageUsers) || (canManageHiringStages && canManageAuthProviders) || (canManageUsers && canManageAuthProviders) ? 'grid-cols-5' : canManageHiringStages || canManageUsers || canManageAuthProviders ? 'grid-cols-4' : 'grid-cols-3'}`}>
          <TabsTrigger value="appearance" data-testid="tab-appearance">
            <Palette className="w-4 h-4 mr-2" />
            Appearance
          </TabsTrigger>
          <TabsTrigger value="departments" data-testid="tab-departments">
            <Building className="w-4 h-4 mr-2" />
            Departments
          </TabsTrigger>
          {canManageUsers && (
            <TabsTrigger value="users" data-testid="tab-users">
              <Users className="w-4 h-4 mr-2" />
              Users
            </TabsTrigger>
          )}
          {canManageHiringStages && (
            <TabsTrigger value="hiring-stages" data-testid="tab-hiring-stages">
              <Target className="w-4 h-4 mr-2" />
              Hiring Stages
            </TabsTrigger>
          )}
          {canManageAuthProviders && (
            <TabsTrigger value="authentication" data-testid="tab-authentication">
              <Shield className="w-4 h-4 mr-2" />
              Authentication
            </TabsTrigger>
          )}
          <TabsTrigger value="system" data-testid="tab-system">
            <SettingsIcon className="w-4 h-4 mr-2" />
            System
          </TabsTrigger>
        </TabsList>

        {/* Appearance Settings */}
        <TabsContent value="appearance" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Palette className="w-4 h-4 mr-2" />
                Theme Preferences
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label className="text-base font-medium">Color Theme</Label>
                <p className="text-sm text-muted-foreground mb-4">
                  Choose your preferred color theme for the application
                </p>
                <div className="grid grid-cols-3 gap-4">
                  <div 
                    className={`border-2 rounded-lg p-4 cursor-pointer transition-colors ${
                      theme === "light" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                    }`}
                    onClick={() => setTheme("light")}
                    data-testid="theme-light"
                  >
                    <div className="flex items-center space-x-3">
                      <Sun className="w-5 h-5" />
                      <div>
                        <p className="font-medium">Light</p>
                        <p className="text-sm text-muted-foreground">Clean and bright</p>
                      </div>
                    </div>
                  </div>
                  
                  <div 
                    className={`border-2 rounded-lg p-4 cursor-pointer transition-colors ${
                      theme === "dark" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                    }`}
                    onClick={() => setTheme("dark")}
                    data-testid="theme-dark"
                  >
                    <div className="flex items-center space-x-3">
                      <Moon className="w-5 h-5" />
                      <div>
                        <p className="font-medium">Dark</p>
                        <p className="text-sm text-muted-foreground">Easy on the eyes</p>
                      </div>
                    </div>
                  </div>
                  
                  <div 
                    className={`border-2 rounded-lg p-4 cursor-pointer transition-colors ${
                      theme === "system" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                    }`}
                    onClick={() => setTheme("system")}
                    data-testid="theme-system"
                  >
                    <div className="flex items-center space-x-3">
                      <Monitor className="w-5 h-5" />
                      <div>
                        <p className="font-medium">System</p>
                        <p className="text-sm text-muted-foreground">Follows system preference</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t pt-6">
                <Label className="text-base font-medium">Display Options</Label>
                <div className="space-y-4 mt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Compact Mode</p>
                      <p className="text-sm text-muted-foreground">Reduce spacing for more information density</p>
                    </div>
                    <Switch data-testid="switch-compact-mode" />
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">Show Tooltips</p>
                      <p className="text-sm text-muted-foreground">Display helpful tooltips throughout the application</p>
                    </div>
                    <Switch defaultChecked data-testid="switch-tooltips" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Departments & Divisions */}
        <TabsContent value="departments" className="space-y-6">
          {/* Departments */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center">
                  <Building className="w-4 h-4 mr-2" />
                  Departments
                </CardTitle>
                <Dialog open={isDepartmentDialogOpen} onOpenChange={setIsDepartmentDialogOpen}>
                  <DialogTrigger asChild>
                    <Button data-testid="button-new-department">
                      <Plus className="w-4 h-4 mr-2" />
                      New Department
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-[95vw] w-full sm:max-w-md max-h-[90vh] sm:max-h-min overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Create New Department</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={departmentForm.handleSubmit(onDepartmentSubmit)} className="space-y-4">
                      <div>
                        <Label htmlFor="dept-name">Department Name</Label>
                        <Input
                          id="dept-name"
                          placeholder="Enter department name"
                          {...departmentForm.register("name")}
                          data-testid="input-department-name"
                        />
                        {departmentForm.formState.errors.name && (
                          <p className="text-sm text-destructive mt-1">
                            {departmentForm.formState.errors.name.message}
                          </p>
                        )}
                      </div>

                      <div className="flex justify-end space-x-2">
                        <Button type="button" variant="outline" onClick={() => setIsDepartmentDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button type="submit" disabled={createDepartmentMutation.isPending}>
                          {createDepartmentMutation.isPending ? "Creating..." : "Create Department"}
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {departmentsLoading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8">
                        <div className="animate-pulse">Loading departments...</div>
                      </TableCell>
                    </TableRow>
                  ) : departments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        No departments found. Create your first department to get started.
                      </TableCell>
                    </TableRow>
                  ) : (
                    departments.map((department: any) => (
                      <TableRow key={department.id} className="hover:bg-muted/50" data-testid={`row-department-${department.id}`}>
                        <TableCell className="font-medium">{department.name}</TableCell>
                        <TableCell>
                          <Badge variant={department.archived ? "secondary" : "default"}>
                            {department.archived ? "Archived" : "Active"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(department.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <Button variant="ghost" size="sm" data-testid={`button-edit-department-${department.id}`}>
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm" data-testid={`button-archive-department-${department.id}`}>
                              <Archive className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Divisions */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center">
                  <Users className="w-4 h-4 mr-2" />
                  Divisions
                </CardTitle>
                <Dialog open={isDivisionDialogOpen} onOpenChange={setIsDivisionDialogOpen}>
                  <DialogTrigger asChild>
                    <Button data-testid="button-new-division">
                      <Plus className="w-4 h-4 mr-2" />
                      New Division
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-[95vw] w-full sm:max-w-md max-h-[90vh] sm:max-h-min overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Create New Division</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={divisionForm.handleSubmit(onDivisionSubmit)} className="space-y-4">
                      <div>
                        <Label htmlFor="div-name">Division Name</Label>
                        <Input
                          id="div-name"
                          placeholder="Enter division name"
                          {...divisionForm.register("name")}
                          data-testid="input-division-name"
                        />
                        {divisionForm.formState.errors.name && (
                          <p className="text-sm text-destructive mt-1">
                            {divisionForm.formState.errors.name.message}
                          </p>
                        )}
                      </div>

                      <div>
                        <Label htmlFor="div-department">Department</Label>
                        <Select
                          value={divisionForm.watch("departmentId")}
                          onValueChange={(value) => divisionForm.setValue("departmentId", value)}
                        >
                          <SelectTrigger data-testid="select-division-department">
                            <SelectValue placeholder="Select department" />
                          </SelectTrigger>
                          <SelectContent>
                            {departments.map((dept: any) => (
                              <SelectItem key={dept.id} value={dept.id}>
                                {dept.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {divisionForm.formState.errors.departmentId && (
                          <p className="text-sm text-destructive mt-1">
                            {divisionForm.formState.errors.departmentId.message}
                          </p>
                        )}
                      </div>

                      <div className="flex justify-end space-x-2">
                        <Button type="button" variant="outline" onClick={() => setIsDivisionDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button type="submit" disabled={createDivisionMutation.isPending}>
                          {createDivisionMutation.isPending ? "Creating..." : "Create Division"}
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {divisionsLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8">
                        <div className="animate-pulse">Loading divisions...</div>
                      </TableCell>
                    </TableRow>
                  ) : divisions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No divisions found. Create your first division to get started.
                      </TableCell>
                    </TableRow>
                  ) : (
                    divisions.map((division: any) => (
                      <TableRow key={division.id} className="hover:bg-muted/50" data-testid={`row-division-${division.id}`}>
                        <TableCell className="font-medium">{division.name}</TableCell>
                        <TableCell>{getDepartmentName(division.departmentId)}</TableCell>
                        <TableCell>
                          <Badge variant={division.archived ? "secondary" : "default"}>
                            {division.archived ? "Archived" : "Active"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(division.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <Button variant="ghost" size="sm" data-testid={`button-edit-division-${division.id}`}>
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="sm" data-testid={`button-archive-division-${division.id}`}>
                              <Archive className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {canManageUsers && (
          <TabsContent value="users" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center">
                    <Users className="w-4 h-4 mr-2" />
                    User Management
                  </CardTitle>
                  <Dialog open={isUserDialogOpen} onOpenChange={setIsUserDialogOpen}>
                    <DialogTrigger asChild>
                      <Button onClick={handleNewUser} data-testid="button-new-user">
                        <Plus className="w-4 h-4 mr-2" />
                        New User
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-[95vw] w-full sm:max-w-md max-h-[90vh] sm:max-h-min overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>
                          {editingUser ? "Edit User" : "Create New User"}
                        </DialogTitle>
                      </DialogHeader>
                      <form onSubmit={userForm.handleSubmit(onUserSubmit)} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="user-firstName">First Name</Label>
                            <Input
                              id="user-firstName"
                              placeholder="Enter first name"
                              {...userForm.register("firstName")}
                              data-testid="input-user-firstName"
                            />
                            {userForm.formState.errors.firstName && (
                              <p className="text-sm text-destructive mt-1">
                                {userForm.formState.errors.firstName.message}
                              </p>
                            )}
                          </div>
                          <div>
                            <Label htmlFor="user-lastName">Last Name</Label>
                            <Input
                              id="user-lastName"
                              placeholder="Enter last name"
                              {...userForm.register("lastName")}
                              data-testid="input-user-lastName"
                            />
                            {userForm.formState.errors.lastName && (
                              <p className="text-sm text-destructive mt-1">
                                {userForm.formState.errors.lastName.message}
                              </p>
                            )}
                          </div>
                        </div>

                        <div>
                          <Label htmlFor="user-email">Email</Label>
                          <Input
                            id="user-email"
                            type="email"
                            placeholder="Enter email address"
                            {...userForm.register("email")}
                            data-testid="input-user-email"
                          />
                          {userForm.formState.errors.email && (
                            <p className="text-sm text-destructive mt-1">
                              {userForm.formState.errors.email.message}
                            </p>
                          )}
                        </div>

                        <div>
                          <Label htmlFor="user-password">Password</Label>
                          <Input
                            id="user-password"
                            type="password"
                            placeholder={editingUser ? "Leave blank to keep current" : "Enter password"}
                            {...userForm.register("passwordHash")}
                            data-testid="input-user-password"
                          />
                          {userForm.formState.errors.passwordHash && (
                            <p className="text-sm text-destructive mt-1">
                              {userForm.formState.errors.passwordHash.message}
                            </p>
                          )}
                        </div>

                        <div>
                          <Label htmlFor="user-role">Role</Label>
                          <Select onValueChange={(value) => userForm.setValue("role", value)} value={userForm.watch("role")}>
                            <SelectTrigger data-testid="select-user-role">
                              <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="system_admin">System Admin</SelectItem>
                              <SelectItem value="hr_staff">HR Staff</SelectItem>
                              <SelectItem value="department_admin">Department Admin</SelectItem>
                              <SelectItem value="division_leader">Division Leader</SelectItem>
                              <SelectItem value="manager">Manager</SelectItem>
                              <SelectItem value="candidate">Candidate</SelectItem>
                            </SelectContent>
                          </Select>
                          {userForm.formState.errors.role && (
                            <p className="text-sm text-destructive mt-1">
                              {userForm.formState.errors.role.message}
                            </p>
                          )}
                        </div>

                        <div>
                          <Label htmlFor="user-status">Status</Label>
                          <Select onValueChange={(value) => userForm.setValue("status", value)} value={userForm.watch("status")}>
                            <SelectTrigger data-testid="select-user-status">
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="invited">Invited</SelectItem>
                              <SelectItem value="disabled">Disabled</SelectItem>
                            </SelectContent>
                          </Select>
                          {userForm.formState.errors.status && (
                            <p className="text-sm text-destructive mt-1">
                              {userForm.formState.errors.status.message}
                            </p>
                          )}
                        </div>

                        <div>
                          <Label htmlFor="user-department">Department</Label>
                          <Select onValueChange={(value) => {
                            userForm.setValue("departmentId", value);
                            userForm.setValue("divisionId", ""); // Clear division when department changes
                          }} value={userForm.watch("departmentId")}>
                            <SelectTrigger data-testid="select-user-department">
                              <SelectValue placeholder="Select department" />
                            </SelectTrigger>
                            <SelectContent>
                              {departments.map((dept: any) => (
                                <SelectItem key={dept.id} value={dept.id}>
                                  {dept.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {userForm.formState.errors.departmentId && (
                            <p className="text-sm text-destructive mt-1">
                              {userForm.formState.errors.departmentId.message}
                            </p>
                          )}
                        </div>

                        <div>
                          <Label htmlFor="user-division">Division</Label>
                          <Select 
                            onValueChange={(value) => userForm.setValue("divisionId", value)} 
                            value={userForm.watch("divisionId")}
                            disabled={!userForm.watch("departmentId")}
                          >
                            <SelectTrigger data-testid="select-user-division">
                              <SelectValue placeholder="Select division" />
                            </SelectTrigger>
                            <SelectContent>
                              {divisions
                                .filter((div: any) => div.departmentId === userForm.watch("departmentId"))
                                .map((div: any) => (
                                <SelectItem key={div.id} value={div.id}>
                                  {div.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {userForm.formState.errors.divisionId && (
                            <p className="text-sm text-destructive mt-1">
                              {userForm.formState.errors.divisionId.message}
                            </p>
                          )}
                        </div>

                        <div className="flex justify-end space-x-2">
                          <Button type="button" variant="outline" onClick={() => setIsUserDialogOpen(false)}>
                            Cancel
                          </Button>
                          <Button type="submit" disabled={createUserMutation.isPending || updateUserMutation.isPending}>
                            {(createUserMutation.isPending || updateUserMutation.isPending) 
                              ? (editingUser ? "Updating..." : "Creating...") 
                              : (editingUser ? "Update User" : "Create User")}
                          </Button>
                        </div>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Search and Filters */}
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <Input
                      placeholder="Search users by name or email..."
                      value={userSearchTerm}
                      onChange={(e) => setUserSearchTerm(e.target.value)}
                      className="max-w-sm"
                      data-testid="input-search-users"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Select value={userStatusFilter} onValueChange={setUserStatusFilter}>
                      <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
                        <SelectValue placeholder="All Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="invited">Invited</SelectItem>
                        <SelectItem value="disabled">Disabled</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={userRoleFilter} onValueChange={setUserRoleFilter}>
                      <SelectTrigger className="w-[140px]" data-testid="select-role-filter">
                        <SelectValue placeholder="All Roles" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Roles</SelectItem>
                        <SelectItem value="system_admin">System Admin</SelectItem>
                        <SelectItem value="hr_staff">HR Staff</SelectItem>
                        <SelectItem value="department_admin">Department Admin</SelectItem>
                        <SelectItem value="division_leader">Division Leader</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="candidate">Candidate</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Users Table */}
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Division</TableHead>
                        <TableHead>Last Login</TableHead>
                        <TableHead className="w-[100px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {usersLoading ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8">
                            <div className="animate-pulse">Loading users...</div>
                          </TableCell>
                        </TableRow>
                      ) : users.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                            No users found. Create your first user to get started.
                          </TableCell>
                        </TableRow>
                      ) : (
                        users
                          .filter((user: any) => {
                            const matchesSearch = (user.firstName + ' ' + user.lastName).toLowerCase().includes(userSearchTerm.toLowerCase()) ||
                                                user.email.toLowerCase().includes(userSearchTerm.toLowerCase());
                            const matchesStatus = userStatusFilter === "all" || user.status === userStatusFilter;
                            const matchesRole = userRoleFilter === "all" || user.role === userRoleFilter;
                            
                            return matchesSearch && matchesStatus && matchesRole;
                          })
                          .map((user: any) => (
                          <TableRow key={user.id} className="hover:bg-muted/50" data-testid={`row-user-${user.id}`}>
                            <TableCell className="font-medium">{user.firstName} {user.lastName}</TableCell>
                            <TableCell className="text-muted-foreground">{user.email}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={getRoleBadgeColor(user.role)}>
                                {user.role.replace('_', ' ').toUpperCase()}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant={user.status === 'active' ? 'default' : user.status === 'disabled' ? 'destructive' : 'secondary'}
                              >
                                {user.status.toUpperCase()}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {user.department?.name || 'Not Assigned'}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {user.division?.name || 'Not Assigned'}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : 'Never'}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center space-x-2">
                                <Button variant="ghost" size="sm" onClick={() => handleEditUser(user)} data-testid={`button-edit-user-${user.id}`}>
                                  <Edit className="w-4 h-4" />
                                </Button>
                                {user.status === 'active' ? (
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="text-destructive" 
                                    onClick={() => handleDisableUser(user)}
                                    data-testid={`button-disable-user-${user.id}`}
                                  >
                                    <Archive className="w-4 h-4" />
                                  </Button>
                                ) : (
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="text-green-600" 
                                    onClick={() => handleEnableUser(user)}
                                    data-testid={`button-enable-user-${user.id}`}
                                  >
                                    <Users className="w-4 h-4" />
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
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Disable User Dialog */}
        <Dialog open={isDisableDialogOpen} onOpenChange={setIsDisableDialogOpen}>
          <DialogContent className="max-w-[95vw] w-full sm:max-w-md max-h-[90vh] sm:max-h-min overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Disable User</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-orange-50 dark:bg-orange-950 p-4 rounded-lg">
                <p className="text-sm font-medium text-orange-800 dark:text-orange-200">
                  Are you sure you want to disable {disablingUser?.name}?
                </p>
                <p className="text-sm text-orange-600 dark:text-orange-400 mt-1">
                  This will prevent them from logging in and accessing the system.
                </p>
              </div>

              {userTaskCount && (userTaskCount.total > 0) && (
                <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                  <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                    Task Assignment
                  </p>
                  <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                    This user has {userTaskCount.total} open task(s) 
                    ({userTaskCount.required} required). You can reassign them to another user.
                  </p>
                  
                  <div className="mt-3">
                    <Label htmlFor="reassign-to">Reassign tasks to (Optional)</Label>
                    <Select value={reassignTo} onValueChange={setReassignTo}>
                      <SelectTrigger className="mt-1" data-testid="select-reassign-user">
                        <SelectValue placeholder="Select user or leave unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Leave Unassigned</SelectItem>
                        {reassignableUsers.map((u: any) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.name} - {u.role.replace('_', ' ').toUpperCase()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="flex justify-end space-x-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsDisableDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleConfirmDisable}
                  disabled={disableUserMutation.isPending}
                  className="bg-destructive hover:bg-destructive/90"
                  data-testid="button-confirm-disable"
                >
                  {disableUserMutation.isPending ? "Disabling..." : "Disable User"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Hiring Stages */}
        {canManageHiringStages && (
          <TabsContent value="hiring-stages" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center">
                    <Target className="w-4 h-4 mr-2" />
                    Hiring Stages
                  </CardTitle>
                  <Dialog open={isHiringStageDialogOpen} onOpenChange={setIsHiringStageDialogOpen}>
                    <DialogTrigger asChild>
                      <Button onClick={handleNewHiringStage} data-testid="button-new-hiring-stage">
                        <Plus className="w-4 h-4 mr-2" />
                        New Hiring Stage
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-[95vw] w-full sm:max-w-md max-h-[90vh] sm:max-h-min overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>
                          {editingHiringStage ? "Edit Hiring Stage" : "Create New Hiring Stage"}
                        </DialogTitle>
                      </DialogHeader>
                      <form onSubmit={hiringStageForm.handleSubmit(onHiringStageSubmit)} className="space-y-4">
                        <div>
                          <Label htmlFor="stage-name">Stage Name</Label>
                          <Input
                            id="stage-name"
                            placeholder="Enter stage name"
                            {...hiringStageForm.register("name")}
                            data-testid="input-stage-name"
                          />
                          {hiringStageForm.formState.errors.name && (
                            <p className="text-sm text-destructive mt-1">
                              {hiringStageForm.formState.errors.name.message}
                            </p>
                          )}
                        </div>

                        <div>
                          <Label htmlFor="stage-description">Description (Optional)</Label>
                          <Input
                            id="stage-description"
                            placeholder="Enter stage description"
                            {...hiringStageForm.register("description")}
                            data-testid="input-stage-description"
                          />
                        </div>

                        <div>
                          <Label htmlFor="stage-order">Order Index</Label>
                          <Input
                            id="stage-order"
                            type="number"
                            min="0"
                            placeholder="0"
                            {...hiringStageForm.register("orderIndex", { valueAsNumber: true })}
                            data-testid="input-stage-order"
                          />
                          {hiringStageForm.formState.errors.orderIndex && (
                            <p className="text-sm text-destructive mt-1">
                              {hiringStageForm.formState.errors.orderIndex.message}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center space-x-2">
                          <Switch 
                            id="stage-active" 
                            checked={hiringStageForm.watch("isActive")}
                            onCheckedChange={(checked) => hiringStageForm.setValue("isActive", checked)}
                            data-testid="switch-stage-active"
                          />
                          <Label htmlFor="stage-active">Active</Label>
                        </div>

                        <div className="flex justify-end space-x-2">
                          <Button 
                            type="button" 
                            variant="outline" 
                            onClick={() => {
                              setIsHiringStageDialogOpen(false);
                              setEditingHiringStage(null);
                            }}
                          >
                            Cancel
                          </Button>
                          <Button 
                            type="submit" 
                            disabled={createHiringStageMutation.isPending || updateHiringStageMutation.isPending}
                          >
                            {createHiringStageMutation.isPending || updateHiringStageMutation.isPending 
                              ? "Saving..." 
                              : editingHiringStage ? "Update Stage" : "Create Stage"
                            }
                          </Button>
                        </div>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {hiringStagesLoading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8">
                          <div className="animate-pulse">Loading hiring stages...</div>
                        </TableCell>
                      </TableRow>
                    ) : hiringStages.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No hiring stages found. Create your first hiring stage to get started.
                        </TableCell>
                      </TableRow>
                    ) : (
                      hiringStages.map((stage: any) => (
                        <TableRow key={stage.id} className="hover:bg-muted/50" data-testid={`row-hiring-stage-${stage.id}`}>
                          <TableCell className="font-medium">{stage.name}</TableCell>
                          <TableCell>{stage.description || "-"}</TableCell>
                          <TableCell>{stage.orderIndex}</TableCell>
                          <TableCell>
                            <Badge variant={stage.isActive ? "default" : "secondary"}>
                              {stage.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {new Date(stage.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center space-x-2">
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => handleEditHiringStage(stage)}
                                data-testid={`button-edit-hiring-stage-${stage.id}`}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => deleteHiringStageMutation.mutate(stage.id)}
                                disabled={deleteHiringStageMutation.isPending}
                                data-testid={`button-delete-hiring-stage-${stage.id}`}
                              >
                                <Archive className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Authentication Providers */}
        {canManageAuthProviders && (
          <TabsContent value="authentication" className="space-y-6">
            <AuthenticationProvidersCard />
          </TabsContent>
        )}

        {/* System Settings */}
        <TabsContent value="system" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <SettingsIcon className="w-4 h-4 mr-2" />
                System Preferences
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Email Notifications</p>
                    <p className="text-sm text-muted-foreground">Receive email updates for task assignments and deadlines</p>
                  </div>
                  <Switch defaultChecked data-testid="switch-email-notifications" />
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Auto-save Changes</p>
                    <p className="text-sm text-muted-foreground">Automatically save form changes</p>
                  </div>
                  <Switch defaultChecked data-testid="switch-auto-save" />
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Show Beta Features</p>
                    <p className="text-sm text-muted-foreground">Enable access to experimental features</p>
                  </div>
                  <Switch data-testid="switch-beta-features" />
                </div>
              </div>

              <div className="border-t pt-6">
                <Label className="text-base font-medium mb-4 block">Data & Privacy</Label>
                <div className="space-y-3">
                  <Button variant="outline" className="justify-start" data-testid="button-export-data">
                    Export My Data
                  </Button>
                  <Button variant="outline" className="justify-start" data-testid="button-privacy-settings">
                    Privacy Settings
                  </Button>
                  <Button variant="outline" className="justify-start text-destructive" data-testid="button-delete-account">
                    Delete Account
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
