import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Badge } from "@/shared/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/shared/components/ui/dialog";
import { Checkbox } from "@/shared/components/ui/checkbox";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { 
  Settings as SettingsIcon, 
  Building, 
  Users, 
  Palette, 
  Plus, 
  Edit, 
  Archive,
  RotateCcw,
  Moon,
  Sun,
  Monitor,
  Target,
  Shield,
  Search,
  Filter,
  Send
} from "lucide-react";
import { apiRequest, queryClient, parseJsonSafe } from "@/lib/queryClient";
import { useToast } from "@/shared/hooks/use-toast";
import { useTheme } from "@/shared/components/layout/theme-provider";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { insertDepartmentSchema, insertDivisionSchema, insertHiringStageSchema } from "@shared/schemas";
import { PaginationControls } from "@/shared/components/pagination-controls";
import { NotificationsCard } from "./NotificationsCard";
import { SmtpSettingsCard } from "./SmtpSettingsCard";

const departmentSchema = insertDepartmentSchema.pick({
  name: true,
});

const divisionSchema = insertDivisionSchema.pick({
  name: true,
  departmentId: true,
});

const hiringStageSchema = insertHiringStageSchema.pick({
  name: true,
  description: true,
  orderIndex: true,
  isActive: true,
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
  // Note: Single role per user. Use department/division scopes for access control.
});

const createUserSchema = userSchema.extend({
  passwordHash: z.string().min(6, "Password must be at least 6 characters"),
});

const editUserSchema = userSchema.extend({
  passwordHash: z.string().min(6, "Password must be at least 6 characters").or(z.literal("")),
});

const inviteSchema = z.object({
  email: z.string().email("Valid email is required"),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  roles: z.array(z.string()).min(1, "Select at least one role"),
  departmentId: z.string().optional(),
  divisionId: z.string().optional(),
});

type DepartmentForm = z.infer<typeof departmentSchema>;
type DivisionForm = z.infer<typeof divisionSchema>;
type HiringStageForm = z.infer<typeof hiringStageSchema>;
type UserForm = z.infer<typeof userSchema>;
type InviteForm = z.infer<typeof inviteSchema>;

const inviteRoleOptions = [
  { value: "system_admin", label: "System Admin" },
  { value: "hr_staff", label: "HR Staff" },
  { value: "department_admin", label: "Department Admin" },
  { value: "division_leader", label: "Division Leader" },
  { value: "manager", label: "Manager" },
  { value: "candidate", label: "Candidate" },
];

const USERS_PAGE_SIZE = 5;

// Authentication Providers Card Component
function AuthenticationProvidersCard() {
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: providers = [], isLoading, error } = useQuery({
    queryKey: ["/api/auth/providers", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/auth/providers");
      return res.json();
    }
  });

  const toggleProviderMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const res = await apiRequest("PATCH", `/api/auth/providers/${id}`, { enabled });
      return await res.json();
    },
    onSuccess: (data, variables) => {
      toast({
        title: "Provider updated",
        description: `${(data as any).name} has been ${variables.enabled ? 'enabled' : 'disabled'}`,
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
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <Table className="min-w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Configuration</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(providers as any[]).map((provider: any) => (
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
            </div>

            {/* Mobile Cards */}
            <div className="space-y-3 md:hidden">
              {(providers as any[]).length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm">No providers found.</div>
              ) : (
                (providers as any[]).map((provider: any) => (
                  <div key={provider.id} className="p-4 border rounded-lg">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium break-words">{provider.name}</div>
                        <div className="text-xs text-muted-foreground break-words">{provider.notes}</div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-muted-foreground">Status</span>
                            <div className="mt-0.5">{getStatusBadge(provider)}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Configured</span>
                            <div className="mt-0.5">{provider.configured ? 'Yes' : 'No'}</div>
                          </div>
                        </div>
                      </div>
                      <Switch
                        checked={provider.effectiveEnabled}
                        disabled={!provider.canEnable || toggleProviderMutation.isPending}
                        onCheckedChange={() => handleToggleProvider(provider.id, provider.effectiveEnabled)}
                        data-testid={`switch-${provider.id}`}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// LDAP Settings Card Component
function LdapSettingsCard() {
  const { toast } = useToast();
  const { user } = useAuth();

  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/auth/ldap", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/auth/ldap");
      return res.json();
    },
  });

  const [form, setForm] = useState<any>({
    url: "",
    startTls: false,
    baseDn: "",
    bindDn: "",
    bindPassword: "",
    userFilter: "(uid={{username}})",
    usernameAttr: "uid",
    firstNameAttr: "givenName",
    lastNameAttr: "sn",
    emailAttr: "mail",
    disabledFilter: "",
  });
  const [hasPassword, setHasPassword] = useState(false);

  useEffect(() => {
    if (data?.settings) {
      const s = data.settings;
      setForm((prev: any) => ({
        ...prev,
        url: s.url || "",
        startTls: !!s.startTls,
        baseDn: s.baseDn || "",
        bindDn: s.bindDnMasked ? "" : prev.bindDn, // don't backfill masked; force admin to confirm value if changing
        bindPassword: "",
        userFilter: s.userFilter || "(uid={{username}})",
        usernameAttr: s.usernameAttr || "uid",
        firstNameAttr: s.firstNameAttr || "givenName",
        lastNameAttr: s.lastNameAttr || "sn",
        emailAttr: s.emailAttr || "mail",
        disabledFilter: s.disabledFilter || "",
      }));
      setHasPassword(!!s.hasPassword);
    }
  }, [data]);

  const onChange = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        url: form.url || undefined,
        startTls: !!form.startTls,
        baseDn: form.baseDn || undefined,
        bindDn: form.bindDn || undefined,
        userFilter: form.userFilter || undefined,
        usernameAttr: form.usernameAttr || undefined,
        firstNameAttr: form.firstNameAttr || undefined,
        lastNameAttr: form.lastNameAttr || undefined,
        emailAttr: form.emailAttr || undefined,
        disabledFilter: form.disabledFilter || undefined,
      };
      // Only send bindPassword if user provided a value; empty string preserves existing
      payload.bindPassword = form.bindPassword === "" ? undefined : form.bindPassword;
      const res = await apiRequest("PUT", "/api/auth/ldap", payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "LDAP settings updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/ldap"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/providers"] });
      setForm((f: any) => ({ ...f, bindPassword: "" }));
    },
    onError: (error: any) => {
      toast({ title: "Save failed", description: error?.message || "Unable to save LDAP settings", variant: "destructive" });
    }
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const payload: any = {
        url: form.url || undefined,
        startTls: !!form.startTls,
        baseDn: form.baseDn || undefined,
        bindDn: form.bindDn || undefined,
        userFilter: form.userFilter || undefined,
        usernameAttr: form.usernameAttr || undefined,
        firstNameAttr: form.firstNameAttr || undefined,
        lastNameAttr: form.lastNameAttr || undefined,
        emailAttr: form.emailAttr || undefined,
        disabledFilter: form.disabledFilter || undefined,
      };
      // For test, attempt to use entered password if present, else omit
      if (form.bindPassword) payload.bindPassword = form.bindPassword;
      const res = await apiRequest("POST", "/api/auth/ldap/test", payload);
      return res.json();
    },
    onSuccess: (r: any) => {
      if (r.ok) {
        toast({ title: "Connection successful", description: `LDAP responded in ${r.durationMs} ms` });
      } else {
        toast({ title: "Connection failed", description: r.message || "Could not connect to LDAP", variant: "destructive" });
      }
    },
    onError: (error: any) => {
      toast({ title: "Test failed", description: error?.message || "Unable to test LDAP connection", variant: "destructive" });
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Shield className="w-4 h-4 mr-2" />
          LDAP Settings
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Configure LDAP/Active Directory connection. Use Authentication Providers to enable or disable LDAP. Users may enter either their username or full email when signing in. If an email is entered, only the part before @ is used to authenticate with Active Directory.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : error ? (
          <div className="text-destructive text-sm">Failed to load LDAP settings</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>LDAP URL</Label>
                <Input placeholder="ldaps://ldap.company.com" value={form.url} onChange={(e) => onChange('url', e.target.value)} data-testid="ldap-url" />
              </div>
              <div className="flex items-end justify-between">
                <div className="flex flex-col">
                  <Label>Use StartTLS</Label>
                  <span className="text-xs text-muted-foreground">Required if not using LDAPS</span>
                </div>
                <Switch checked={!!form.startTls} onCheckedChange={(v) => onChange('startTls', v)} data-testid="ldap-starttls" />
              </div>

              <div>
                <Label>Base DN</Label>
                <Input placeholder="dc=company,dc=com" value={form.baseDn} onChange={(e) => onChange('baseDn', e.target.value)} data-testid="ldap-basedn" />
              </div>
              <div>
                <Label>Bind DN</Label>
                <Input placeholder={data?.settings?.bindDnMasked || "cn=service,ou=svc,dc=company,dc=com"} value={form.bindDn} onChange={(e) => onChange('bindDn', e.target.value)} data-testid="ldap-binddn" />
                {data?.settings?.bindDnMasked && (
                  <p className="text-xs text-muted-foreground mt-1">Stored as {data.settings.bindDnMasked}. Leave empty to keep.</p>
                )}
              </div>

              <div>
                <Label>Bind Password</Label>
                <Input type="password" placeholder={hasPassword ? "•••••• (set)" : "Enter password"} value={form.bindPassword} onChange={(e) => onChange('bindPassword', e.target.value)} data-testid="ldap-bindpw" />
                {hasPassword && <p className="text-xs text-muted-foreground mt-1">Leave blank to keep current password</p>}
              </div>
              <div>
                <Label>User Filter</Label>
                <Input placeholder="(uid={{username}})" value={form.userFilter} onChange={(e) => onChange('userFilter', e.target.value)} data-testid="ldap-userfilter" />
              </div>

              <div>
                <Label>Username Attribute</Label>
                <Input placeholder="uid" value={form.usernameAttr} onChange={(e) => onChange('usernameAttr', e.target.value)} data-testid="ldap-attr-username" />
              </div>
              <div>
                <Label>First Name Attribute</Label>
                <Input placeholder="givenName" value={form.firstNameAttr} onChange={(e) => onChange('firstNameAttr', e.target.value)} data-testid="ldap-attr-firstname" />
              </div>
              <div>
                <Label>Last Name Attribute</Label>
                <Input placeholder="sn" value={form.lastNameAttr} onChange={(e) => onChange('lastNameAttr', e.target.value)} data-testid="ldap-attr-lastname" />
              </div>
              <div>
                <Label>Email Attribute</Label>
                <Input placeholder="mail" value={form.emailAttr} onChange={(e) => onChange('emailAttr', e.target.value)} data-testid="ldap-attr-email" />
              </div>
              <div>
                <Label>Disabled Filter (optional)</Label>
                <Input placeholder="(userAccountControl:1.2.840.113556.1.4.803:=2)" value={form.disabledFilter} onChange={(e) => onChange('disabledFilter', e.target.value)} data-testid="ldap-disabled-filter" />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="ldap-save">
                {saveMutation.isPending ? 'Saving…' : 'Save Settings'}
              </Button>
              <Button variant="outline" onClick={() => testMutation.mutate()} disabled={testMutation.isPending} data-testid="ldap-test">
                {testMutation.isPending ? 'Testing…' : 'Test Connection'}
              </Button>
              {data?.configured === false && (
                <div className="text-xs text-muted-foreground sm:ml-2 self-center">Not configured</div>
              )}
            </div>
            {data?.warnings?.length > 0 && (
              <div className="text-xs text-amber-600 dark:text-amber-400">{data.warnings[0]}</div>
            )}
          </>
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
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [isDisableDialogOpen, setIsDisableDialogOpen] = useState(false);
  const [isArchiveDepartmentDialogOpen, setIsArchiveDepartmentDialogOpen] = useState(false);
  const [isArchiveDivisionDialogOpen, setIsArchiveDivisionDialogOpen] = useState(false);
  const [isRestoreDepartmentDialogOpen, setIsRestoreDepartmentDialogOpen] = useState(false);
  const [isRestoreDivisionDialogOpen, setIsRestoreDivisionDialogOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<any>(null);
  const [editingDivision, setEditingDivision] = useState<any>(null);
  const [editingHiringStage, setEditingHiringStage] = useState<any>(null);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [disablingUser, setDisablingUser] = useState<any>(null);
  const [archivingDepartment, setArchivingDepartment] = useState<any>(null);
  const [archivingDivision, setArchivingDivision] = useState<any>(null);
  const [restoringDepartment, setRestoringDepartment] = useState<any>(null);
  const [restoringDivision, setRestoringDivision] = useState<any>(null);
  const [reassignTo, setReassignTo] = useState<string>("");
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [userStatusFilter, setUserStatusFilter] = useState<string>("all");
  const [userRoleFilter, setUserRoleFilter] = useState<string>("all");
  const [userCurrentPage, setUserCurrentPage] = useState(1);
  const [departmentSearchTerm, setDepartmentSearchTerm] = useState("");
  const [departmentArchiveFilter, setDepartmentArchiveFilter] = useState<string>("active");
  const [divisionSearchTerm, setDivisionSearchTerm] = useState("");
  const [divisionDepartmentFilter, setDivisionDepartmentFilter] = useState<string>("all");
  const [divisionArchiveFilter, setDivisionArchiveFilter] = useState<string>("active");
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  // Debug flag removed

  // Check if user can manage hiring stages and users
  const canManageHiringStages = user?.role === "system_admin" || user?.role === "hr_staff";
  const canManageUsers = user?.role === "system_admin" || user?.role === "hr_staff";
  const canManageAuthProviders = user?.role === "system_admin" || user?.role === "hr_staff";
  const canManageSystem = user?.role === "system_admin" || user?.role === "hr_staff";

  // Helper: robust archived detection across possible shapes
  const isArchived = (entity: any): boolean => {
    if (!entity) return false;
    // boolean
    if (typeof entity.archived === 'boolean') return entity.archived;
    // numeric flags
    if (typeof entity.archived === 'number') return entity.archived === 1;
    // string variants
    if (typeof entity.archived === 'string') {
      const v = entity.archived.toLowerCase();
      if (v === 'true' || v === '1' || v === 'yes') return true;
      if (v === 'false' || v === '0' || v === 'no') return false;
    }
    if (typeof entity.isArchived === 'boolean') return entity.isArchived;
    if (typeof entity.status === 'string') return entity.status.toLowerCase() === 'archived';
    if (entity.archivedAt) return true;
    if (typeof entity.isActive === 'boolean') return entity.isActive === false;
    return false;
  };

  // Dev-only helpers removed

  // Departments (include archived to support Archived Only filter)
  const { data: departments = [], isLoading: departmentsLoading, isError: departmentsError } = useQuery({
    queryKey: ["/api/departments", user?.id, { includeArchived: true }],
    enabled: !!user,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/departments?includeArchived=true");
      return res.json();
    },
  });

  // Filter departments
  const filteredDepartments = (departments as any[]).filter((department: any) => {
    if (!department) return false;
    
    // Apply archive filter
    const archived = isArchived(department);
    if (departmentArchiveFilter === "active" && archived) return false;
    if (departmentArchiveFilter === "archived" && !archived) return false;
    
    // Apply search filter
    return department.name.toLowerCase().includes(departmentSearchTerm.toLowerCase());
  });

  const { data: divisions = [], isLoading: divisionsLoading, isError: divisionsError } = useQuery({
    queryKey: ["/api/divisions", user?.id, { includeArchived: true, v: 2 }],
    enabled: !!user,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/divisions?includeArchived=true");
      return res.json();
    },
  });

  // Filter divisions
  const filteredDivisions = (divisions as any[]).filter((division: any) => {
    if (!division) return false;
    
    // Apply archive filter
    const archived = isArchived(division);
    if (divisionArchiveFilter === "active" && archived) return false;
    if (divisionArchiveFilter === "archived" && !archived) return false;
    
    // Apply department filter
    if (divisionDepartmentFilter !== "all" && division.departmentId !== divisionDepartmentFilter) return false;
    
    // Apply search filter
    return division.name.toLowerCase().includes(divisionSearchTerm.toLowerCase());
  });

  const { data: hiringStages = [], isLoading: hiringStagesLoading } = useQuery({
    queryKey: ["/api/hiring-stages", user?.id],
    enabled: !!user && canManageHiringStages, // Only fetch if user has permission
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/hiring-stages");
      return res.json();
    }
  });

  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ["/api/users", user?.id],
    enabled: !!user && canManageUsers, // Only fetch if user has permission
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/users");
      return res.json();
    }
  });

  // System settings
  const { data: systemSettings = { auto_regress_on_prior_open: false } } = useQuery({
    queryKey: ["/api/system-settings", user?.id],
    enabled: !!user && canManageSystem,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/system-settings");
      return res.json();
    },
  });
  const toggleAutoRegress = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiRequest("PATCH", "/api/system-settings", { auto_regress_on_prior_open: enabled });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system-settings"] });
      toast({ title: "Updated", description: "System setting saved." });
    }
  });

  // Optional server-side debug for departments
  // No client debug queries in production UI

  const { data: userTaskCount } = useQuery({
    queryKey: ["/api/users", user?.id, disablingUser?.id, "task-count"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/users/${disablingUser.id}/task-count`);
      return res.json();
    },
    enabled: !!user && !!disablingUser?.id,
  });

  const filteredUsers = useMemo(() => {
    return (users as any[]).filter((user: any) => {
      const matchesSearch =
        `${user.firstName} ${user.lastName}`.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(userSearchTerm.toLowerCase());
      const matchesStatus = userStatusFilter === "all" || user.status === userStatusFilter;
      const matchesRole = userRoleFilter === "all" || user.role === userRoleFilter;

      return matchesSearch && matchesStatus && matchesRole;
    });
  }, [users, userSearchTerm, userStatusFilter, userRoleFilter]);

  const userPageSize = USERS_PAGE_SIZE;
  const totalUsers = filteredUsers.length;
  const userTotalPages = totalUsers > 0 ? Math.ceil(totalUsers / userPageSize) : 1;
  const paginatedUsers = useMemo(() => {
    const start = (userCurrentPage - 1) * userPageSize;
    return filteredUsers.slice(start, start + userPageSize);
  }, [filteredUsers, userCurrentPage, userPageSize]);

  useEffect(() => {
    setUserCurrentPage(1);
  }, [userSearchTerm, userStatusFilter, userRoleFilter]);

  useEffect(() => {
    setUserCurrentPage((prev) => Math.min(prev, userTotalPages));
  }, [userTotalPages]);

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
      queryClient.invalidateQueries({ queryKey: ["/api/departments"], exact: false });
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
      queryClient.invalidateQueries({ queryKey: ["/api/divisions"], exact: false });
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

  const updateDepartmentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<DepartmentForm> }) => {
      const res = await apiRequest("PATCH", `/api/departments/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/departments"], exact: false });
      setIsDepartmentDialogOpen(false);
      setEditingDepartment(null);
      departmentForm.reset();
      toast({
        title: "Success",
        description: "Department updated successfully",
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

  const archiveDepartmentMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/departments/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/departments"], exact: false });
      setIsArchiveDepartmentDialogOpen(false);
      setArchivingDepartment(null);
      toast({
        title: "Success",
        description: "Department archived successfully",
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

  const restoreDepartmentMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/departments/${id}/restore`);
      return parseJsonSafe(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/departments"], exact: false });
      setIsRestoreDepartmentDialogOpen(false);
      setRestoringDepartment(null);
      toast({
        title: "Success",
        description: "Department restored successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to restore department. If this persists, try restarting the server.",
        variant: "destructive",
      });
    },
  });

  const updateDivisionMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<DivisionForm> }) => {
      const res = await apiRequest("PATCH", `/api/divisions/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/divisions"], exact: false });
      setIsDivisionDialogOpen(false);
      setEditingDivision(null);
      divisionForm.reset();
      toast({
        title: "Success",
        description: "Division updated successfully",
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

  const archiveDivisionMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/divisions/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/divisions"], exact: false });
      setIsArchiveDivisionDialogOpen(false);
      setArchivingDivision(null);
      toast({
        title: "Success",
        description: "Division archived successfully",
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

  const restoreDivisionMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/divisions/${id}/restore`);
      return parseJsonSafe(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/divisions"], exact: false });
      setIsRestoreDivisionDialogOpen(false);
      setRestoringDivision(null);
      toast({
        title: "Success",
        description: "Division restored successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to restore division. If this persists, try restarting the server.",
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

  const sendInviteMutation = useMutation({
    mutationFn: async (data: InviteForm) => {
      const res = await apiRequest("POST", "/api/invitations", {
        email: data.email.trim().toLowerCase(),
        firstName: data.firstName?.trim() || undefined,
        lastName: data.lastName?.trim() || undefined,
        roles: data.roles,
        departmentId: data.departmentId || undefined,
        divisionId: data.divisionId || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      inviteForm.reset({ email: "", roles: [] });
      setIsInviteDialogOpen(false);
      // Refresh users so the invited entry appears immediately
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Invitation sent",
        description: "Invite email was queued for delivery.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to send invite",
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
      divisionId: undefined
    },
  });

  const inviteForm = useForm<InviteForm>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: "",
      roles: [],
      departmentId: "",
      divisionId: "",
    },
  });

  const getDepartmentName = (departmentId: string) => {
    const department = (departments as any[]).find((d: any) => d.id === departmentId);
    return department?.name || "Unknown";
  };

  const onDepartmentSubmit = (data: DepartmentForm) => {
    if (editingDepartment) {
      updateDepartmentMutation.mutate({ id: editingDepartment.id, data });
    } else {
      createDepartmentMutation.mutate(data);
    }
  };

  const onDivisionSubmit = (data: DivisionForm) => {
    if (editingDivision) {
      updateDivisionMutation.mutate({ id: editingDivision.id, data });
    } else {
      createDivisionMutation.mutate(data);
    }
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

  const handleEditDepartment = (department: any) => {
    setEditingDepartment(department);
    departmentForm.reset({
      name: department.name,
    });
    setIsDepartmentDialogOpen(true);
  };

  const handleNewDepartment = () => {
    setEditingDepartment(null);
    departmentForm.reset({
      name: "",
    });
    setIsDepartmentDialogOpen(true);
  };

  const handleArchiveDepartment = (department: any) => {
    setArchivingDepartment(department);
    setIsArchiveDepartmentDialogOpen(true);
  };

  const handleRestoreDepartment = (department: any) => {
    setRestoringDepartment(department);
    setIsRestoreDepartmentDialogOpen(true);
  };

  const handleConfirmArchiveDepartment = () => {
    if (archivingDepartment) {
      archiveDepartmentMutation.mutate(archivingDepartment.id);
    }
  };

  const handleConfirmRestoreDepartment = () => {
    if (restoringDepartment) {
      restoreDepartmentMutation.mutate(restoringDepartment.id);
    }
  };

  const handleEditDivision = (division: any) => {
    setEditingDivision(division);
    divisionForm.reset({
      name: division.name,
      departmentId: division.departmentId,
    });
    setIsDivisionDialogOpen(true);
  };

  const handleNewDivision = () => {
    setEditingDivision(null);
    divisionForm.reset({
      name: "",
      departmentId: "",
    });
    setIsDivisionDialogOpen(true);
  };

  const handleArchiveDivision = (division: any) => {
    setArchivingDivision(division);
    setIsArchiveDivisionDialogOpen(true);
  };

  const handleRestoreDivision = (division: any) => {
    setRestoringDivision(division);
    setIsRestoreDivisionDialogOpen(true);
  };

  const handleConfirmArchiveDivision = () => {
    if (archivingDivision) {
      archiveDivisionMutation.mutate(archivingDivision.id);
    }
  };

  const handleConfirmRestoreDivision = () => {
    if (restoringDivision) {
      restoreDivisionMutation.mutate(restoringDivision.id);
    }
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
      divisionId: user.divisionId || undefined
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
      divisionId: undefined
    });
    // Update resolver for create mode
    userForm.clearErrors();
    setIsUserDialogOpen(true);
  };

  const onInviteSubmit = (data: InviteForm) => {
    sendInviteMutation.mutate(data);
  };

  const toggleInviteRole = (role: string, checked: boolean) => {
    const current = inviteForm.getValues("roles");
    const next = checked ? Array.from(new Set([...current, role])) : current.filter((r) => r !== role);
    inviteForm.setValue("roles", next, { shouldValidate: true });
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
  const reassignableUsers = (users as any[]).filter((u: any) => 
    u.status === 'active' && u.id !== disablingUser?.id
  );

  // Divisions filtered by selected department for the User form (server-side)
  const selectedUserDepartmentId = userForm?.watch ? userForm.watch("departmentId") : undefined;
  const selectedInviteDepartmentId = inviteForm?.watch ? inviteForm.watch("departmentId") : undefined;
  const selectedInviteRoles = inviteForm.watch("roles");
  const { data: divisionsForUserDept = [] } = useQuery({
    queryKey: ["/api/divisions", user?.id, { departmentId: selectedUserDepartmentId }],
    queryFn: async () => {
      if (!selectedUserDepartmentId) return [] as any[];
      const params = new URLSearchParams({ departmentId: selectedUserDepartmentId, limit: '100' });
      const res = await apiRequest("GET", `/api/divisions?${params.toString()}`);
      return res.json();
    },
    enabled: !!user && !!selectedUserDepartmentId,
  });
  // Divisions filtered for the Invite dialog department selection
  const { data: divisionsForInviteDept = [] } = useQuery({
    queryKey: ["/api/divisions", user?.id, { departmentId: selectedInviteDepartmentId, for: 'invite' }],
    queryFn: async () => {
      if (!selectedInviteDepartmentId) return [] as any[];
      const params = new URLSearchParams({ departmentId: selectedInviteDepartmentId as string, limit: '100' });
      const res = await apiRequest("GET", `/api/divisions?${params.toString()}`);
      return res.json();
    },
    enabled: !!user && !!selectedInviteDepartmentId,
  });

  return (
    <div className="p-4 sm:p-6 space-y-4 xs:space-y-5 sm:space-y-6">
      {/* Page Header */}
      <div className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-3 xs:gap-4">
        <div className="min-w-0">
          <h1 className="text-lg xs:text-xl sm:text-2xl font-bold text-foreground" data-testid="text-settings-title">Settings</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Manage your application preferences and organization structure</p>
        </div>
      </div>

      <Tabs defaultValue="appearance" className="w-full">
        <TabsList className={`grid grid-cols-2 md:grid w-full gap-2 h-auto items-start ${
          (canManageHiringStages && canManageUsers && canManageAuthProviders && canManageSystem) ? 'md:grid-cols-6' :
          (
            [canManageHiringStages, canManageUsers, canManageAuthProviders, canManageSystem].filter(Boolean).length === 3 ? 'md:grid-cols-5' :
            [canManageHiringStages, canManageUsers, canManageAuthProviders, canManageSystem].filter(Boolean).length === 2 ? 'md:grid-cols-4' :
            [canManageHiringStages, canManageUsers, canManageAuthProviders, canManageSystem].filter(Boolean).length === 1 ? 'md:grid-cols-3' : 'md:grid-cols-2'
          )
        }`}>
          <TabsTrigger value="appearance" data-testid="tab-appearance" className="w-full">
            <Palette className="w-4 h-4 mr-2" />
            Appearance
          </TabsTrigger>
          <TabsTrigger value="organization" data-testid="tab-organization" className="w-full">
            <Building className="w-4 h-4 mr-2" />
            Organization
          </TabsTrigger>
          {canManageUsers && (
            <TabsTrigger value="users" data-testid="tab-users" className="w-full">
              <Users className="w-4 h-4 mr-2" />
              Users
            </TabsTrigger>
          )}
          {canManageHiringStages && (
            <TabsTrigger value="hiring-stages" data-testid="tab-hiring-stages" className="w-full">
              <Target className="w-4 h-4 mr-2" />
              Hiring Stages
            </TabsTrigger>
          )}
          {canManageAuthProviders && (
            <TabsTrigger value="authentication" data-testid="tab-authentication" className="w-full">
              <Shield className="w-4 h-4 mr-2" />
              Authentication
            </TabsTrigger>
          )}
          {canManageSystem && (
            <TabsTrigger value="system" data-testid="tab-system" className="w-full">
              <SettingsIcon className="w-4 h-4 mr-2" />
              System
            </TabsTrigger>
          )}
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

          <NotificationsCard />
          <SmtpSettingsCard />
        </TabsContent>

        {/* Departments & Divisions */}
        <TabsContent value="organization" className="space-y-6">
          {/* Departments */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center">
                  <Building className="w-4 h-4 mr-2" />
                  Departments
                </CardTitle>
                {/* Debug counts to help verify data received; only show if any data present */}
                {/* Debug counters removed */}
                <Dialog open={isDepartmentDialogOpen} onOpenChange={setIsDepartmentDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={handleNewDepartment} data-testid="button-new-department">
                      <Plus className="w-4 h-4 mr-2" />
                      New Department
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-[95vw] w-full sm:max-w-md max-h-[90vh] sm:max-h-min overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>
                        {editingDepartment ? "Edit Department" : "Create New Department"}
                      </DialogTitle>
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
                        <Button 
                          type="button" 
                          variant="outline" 
                          onClick={() => {
                            setIsDepartmentDialogOpen(false);
                            setEditingDepartment(null);
                          }}
                        >
                          Cancel
                        </Button>
                        <Button 
                          type="submit" 
                          disabled={createDepartmentMutation.isPending || updateDepartmentMutation.isPending}
                        >
                          {(createDepartmentMutation.isPending || updateDepartmentMutation.isPending) 
                            ? (editingDepartment ? "Updating..." : "Creating...") 
                            : (editingDepartment ? "Update Department" : "Create Department")
                          }
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            
            {/* Search and Filter for Departments */}
            <div className="p-3 xs:p-4 sm:p-6 pt-0 border-b">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    <Input
                      placeholder="Search departments..."
                      value={departmentSearchTerm}
                      onChange={(e) => setDepartmentSearchTerm(e.target.value)}
                      className="pl-10"
                      data-testid="input-search-departments"
                    />
                  </div>
                </div>
                <Select value={departmentArchiveFilter} onValueChange={setDepartmentArchiveFilter}>
                  <SelectTrigger className="w-[180px]" data-testid="select-department-archive-filter">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    <SelectItem value="active">Active Only</SelectItem>
                    <SelectItem value="archived">Archived Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <CardContent className="p-0">
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
              <Table className="min-w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {departmentsError ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8">
                        <div className="flex items-center justify-center gap-3">
                          <span className="text-destructive">Failed to load departments. Please check authentication.</span>
                          <Button size="sm" variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/departments"], exact: false })}>
                            Retry
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : departmentsLoading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8">
                        <div className="animate-pulse">Loading departments...</div>
                      </TableCell>
                    </TableRow>
                  ) : filteredDepartments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        {(departments as any[]).length === 0 ? "No departments found. Create your first department to get started." : "No departments match your search criteria."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredDepartments.map((department: any) => (
                      <TableRow key={department.id} className="hover:bg-muted/50" data-testid={`row-department-${department.id}`}>
                        <TableCell className="font-medium">{department.name}</TableCell>
                        <TableCell>
                          <Badge variant={isArchived(department) ? "secondary" : "default"}>
                            {isArchived(department) ? "Archived" : "Active"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(department.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleEditDepartment(department)}
                              data-testid={`button-edit-department-${department.id}`}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            {isArchived(department) ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRestoreDepartment(department)}
                                data-testid={`button-restore-department-${department.id}`}
                              >
                                <RotateCcw className="w-4 h-4" />
                              </Button>
                            ) : (
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => handleArchiveDepartment(department)}
                                data-testid={`button-archive-department-${department.id}`}
                              >
                                <Archive className="w-4 h-4" />
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

              {/* Mobile Cards */}
              <div className="space-y-3 p-4 md:hidden">
                {departmentsLoading ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">Loading departments...</div>
                ) : filteredDepartments.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    {(departments as any[]).length === 0 ? "No departments found. Create your first department to get started." : "No departments match your search criteria."}
                  </div>
                ) : (
                  filteredDepartments.map((department: any) => (
                    <div key={department.id} className="p-4 border rounded-lg" data-testid={`card-department-${department.id}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium break-words">{department.name}</div>
                          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-muted-foreground">Status</span>
                              <div className="mt-0.5">
                                <Badge variant={isArchived(department) ? "secondary" : "default"}>
                                  {isArchived(department) ? "Archived" : "Active"}
                                </Badge>
                              </div>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Created</span>
                              <div className="mt-0.5">{new Date(department.createdAt).toLocaleDateString()}</div>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => handleEditDepartment(department)}>Edit</Button>
                          {isArchived(department) ? (
                            <Button variant="ghost" size="sm" onClick={() => handleRestoreDepartment(department)}>Restore</Button>
                          ) : (
                            <Button variant="ghost" size="sm" onClick={() => handleArchiveDepartment(department)}>Archive</Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
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
                {/* Debug counters removed */}
                <Dialog open={isDivisionDialogOpen} onOpenChange={setIsDivisionDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={handleNewDivision} data-testid="button-new-division">
                      <Plus className="w-4 h-4 mr-2" />
                      New Division
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-[95vw] w-full sm:max-w-md max-h-[90vh] sm:max-h-min overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>
                        {editingDivision ? "Edit Division" : "Create New Division"}
                      </DialogTitle>
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
                            {(departments as any[]).map((dept: any) => (
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
                        <Button 
                          type="button" 
                          variant="outline" 
                          onClick={() => {
                            setIsDivisionDialogOpen(false);
                            setEditingDivision(null);
                          }}
                        >
                          Cancel
                        </Button>
                        <Button 
                          type="submit" 
                          disabled={createDivisionMutation.isPending || updateDivisionMutation.isPending}
                        >
                          {(createDivisionMutation.isPending || updateDivisionMutation.isPending) 
                            ? (editingDivision ? "Updating..." : "Creating...") 
                            : (editingDivision ? "Update Division" : "Create Division")
                          }
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            
            {/* Search and Filter for Divisions */}
            <div className="p-3 xs:p-4 sm:p-6 pt-0 border-b">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    <Input
                      placeholder="Search divisions..."
                      value={divisionSearchTerm}
                      onChange={(e) => setDivisionSearchTerm(e.target.value)}
                      className="pl-10"
                      data-testid="input-search-divisions"
                    />
                  </div>
                </div>
                <div className="flex gap-4 flex-wrap">
                  <Select value={divisionDepartmentFilter} onValueChange={setDivisionDepartmentFilter}>
                    <SelectTrigger className="w-[180px]" data-testid="select-division-department-filter">
                      <SelectValue placeholder="Filter by department" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Departments</SelectItem>
                      {(departments as any[]).map((dept: any) => (
                        <SelectItem key={dept.id} value={dept.id}>
                          {dept.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={divisionArchiveFilter} onValueChange={setDivisionArchiveFilter}>
                    <SelectTrigger className="w-[160px]" data-testid="select-division-archive-filter">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Divisions</SelectItem>
                      <SelectItem value="active">Active Only</SelectItem>
                      <SelectItem value="archived">Archived Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <CardContent className="p-0">
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
              <Table className="min-w-full">
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
                  {divisionsError ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8">
                        <div className="flex items-center justify-center gap-3">
                          <span className="text-destructive">Failed to load divisions. Please check authentication.</span>
                          <Button size="sm" variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/divisions"], exact: false })}>
                            Retry
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : divisionsLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8">
                        <div className="animate-pulse">Loading divisions...</div>
                      </TableCell>
                    </TableRow>
                  ) : filteredDivisions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        {(divisions as any[]).length === 0 ? "No divisions found. Create your first division to get started." : "No divisions match your search criteria."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredDivisions.map((division: any) => (
                      <TableRow key={division.id} className="hover:bg-muted/50" data-testid={`row-division-${division.id}`}>
                        <TableCell className="font-medium">{division.name}</TableCell>
                        <TableCell>{getDepartmentName(division.departmentId)}</TableCell>
                        <TableCell>
                          <Badge variant={isArchived(division) ? "secondary" : "default"}>
                            {isArchived(division) ? "Archived" : "Active"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(division.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleEditDivision(division)}
                              data-testid={`button-edit-division-${division.id}`}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            {isArchived(division) ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRestoreDivision(division)}
                                data-testid={`button-restore-division-${division.id}`}
                              >
                                <RotateCcw className="w-4 h-4" />
                              </Button>
                            ) : (
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => handleArchiveDivision(division)}
                                data-testid={`button-archive-division-${division.id}`}
                              >
                                <Archive className="w-4 h-4" />
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

              {/* Mobile Cards */}
              <div className="space-y-3 p-4 md:hidden">
                {divisionsLoading ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">Loading divisions...</div>
                ) : filteredDivisions.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    {(divisions as any[]).length === 0 ? "No divisions found. Create your first division to get started." : "No divisions match your search criteria."}
                  </div>
                ) : (
                  filteredDivisions.map((division: any) => (
                    <div key={division.id} className="p-4 border rounded-lg" data-testid={`card-division-${division.id}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium break-words">{division.name}</div>
                          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-muted-foreground">Department</span>
                              <div className="mt-0.5">{getDepartmentName(division.departmentId)}</div>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Status</span>
                              <div className="mt-0.5">
                                <Badge variant={isArchived(division) ? "secondary" : "default"}>
                                  {isArchived(division) ? "Archived" : "Active"}
                                </Badge>
                              </div>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Created</span>
                              <div className="mt-0.5">{new Date(division.createdAt).toLocaleDateString()}</div>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => handleEditDivision(division)}>Edit</Button>
                          {isArchived(division) ? (
                            <Button variant="ghost" size="sm" onClick={() => handleRestoreDivision(division)}>Restore</Button>
                          ) : (
                            <Button variant="ghost" size="sm" onClick={() => handleArchiveDivision(division)}>Archive</Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {canManageUsers && (
          <TabsContent value="users" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="flex items-center">
                    <Users className="w-4 h-4 mr-2" />
                    User Management
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Dialog
                      open={isInviteDialogOpen}
                      onOpenChange={(open) => {
                        setIsInviteDialogOpen(open);
                        if (!open) {
                          inviteForm.reset({ email: "", roles: [] });
                          inviteForm.clearErrors();
                        }
                      }}
                    >
                      <DialogTrigger asChild>
                        <Button variant="outline" data-testid="button-send-invite">
                          <Send className="w-4 h-4 mr-2" />
                          Invite Users
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-h-min max-w-[95vw] w-full sm:max-w-md">
                        <DialogHeader>
                          <DialogTitle>Invite Users</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={inviteForm.handleSubmit(onInviteSubmit)} className="space-y-4" data-testid="form-send-invite">
                          <div className="space-y-2">
                            <Label htmlFor="invite-email">Email</Label>
                            <Input
                              id="invite-email"
                              type="email"
                              placeholder="person@example.edu"
                              {...inviteForm.register("email")}
                              data-testid="input-invite-email"
                            />
                            {inviteForm.formState.errors.email && (
                              <p className="text-sm text-destructive mt-1">
                                {inviteForm.formState.errors.email.message}
                              </p>
                            )}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <Label htmlFor="invite-firstName">First name</Label>
                              <Input id="invite-firstName" placeholder="First name" {...inviteForm.register("firstName")} />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="invite-lastName">Last name</Label>
                              <Input id="invite-lastName" placeholder="Last name" {...inviteForm.register("lastName")} />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="invite-department">Department</Label>
                            <Select onValueChange={(value) => { inviteForm.setValue('departmentId', value); inviteForm.setValue('divisionId', ''); }} value={inviteForm.watch('departmentId') || ''}>
                              <SelectTrigger data-testid="select-invite-department">
                                <SelectValue placeholder="Select department" />
                              </SelectTrigger>
                              <SelectContent>
                                {(departments as any[]).map((dept: any) => (
                                  <SelectItem key={dept.id} value={dept.id}>
                                    {dept.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="invite-division">Division</Label>
                          <Select onValueChange={(value) => inviteForm.setValue('divisionId', value)} value={inviteForm.watch('divisionId') || ''} disabled={!inviteForm.watch('departmentId')}>
                            <SelectTrigger data-testid="select-invite-division">
                              <SelectValue placeholder="Select division" />
                            </SelectTrigger>
                            <SelectContent>
                              {(!inviteForm.watch('departmentId') || divisionsForInviteDept.length === 0) ? (
                                <SelectItem disabled value="__no_divisions__">No divisions available.</SelectItem>
                              ) : (
                                (divisionsForInviteDept as any[]).map((div: any) => (
                                  <SelectItem key={div.id} value={div.id}>
                                    {div.name}
                                  </SelectItem>
                                ))
                              )}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Select Roles</Label>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {inviteRoleOptions.map((role) => (
                                <div key={role.value} className="flex items-center gap-2 rounded border px-3 py-2">
                                  <Checkbox
                                    id={`invite-role-${role.value}`}
                                    checked={selectedInviteRoles.includes(role.value)}
                                    onCheckedChange={(checked) => toggleInviteRole(role.value, !!checked)}
                                  />
                                  <Label htmlFor={`invite-role-${role.value}`} className="font-normal">
                                    {role.label}
                                  </Label>
                                </div>
                              ))}
                            </div>
                            {inviteForm.formState.errors.roles && (
                              <p className="text-sm text-destructive mt-1">
                                {inviteForm.formState.errors.roles.message}
                              </p>
                            )}
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                inviteForm.reset({ email: "", roles: [] });
                                inviteForm.clearErrors();
                                setIsInviteDialogOpen(false);
                              }}
                            >
                              Cancel
                            </Button>
                            <Button type="submit" disabled={sendInviteMutation.isPending} data-testid="button-submit-invite">
                              {sendInviteMutation.isPending ? "Sending…" : "Send Invite"}
                            </Button>
                          </div>
                        </form>
                      </DialogContent>
                    </Dialog>
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
                              {(departments as any[]).map((dept: any) => (
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
                              {(!selectedUserDepartmentId || divisionsForUserDept.length === 0) ? (
                                <SelectItem disabled value="__no_divisions__">No divisions available.</SelectItem>
                              ) : (
                                (divisionsForUserDept as any[]).map((div: any) => (
                                  <SelectItem key={div.id} value={div.id}>
                                    {div.name}
                                  </SelectItem>
                                ))
                              )}
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
                      className="w-full sm:max-w-sm lg:max-w-full"
                      data-testid="input-search-users"
                    />
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
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

                {/* Users Table (Desktop) */}
                <div className="hidden md:block border rounded-lg">
                  <div className="overflow-x-auto">
                    <Table className="min-w-full">
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
                        ) : filteredUsers.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                              {(users as any[]).length === 0
                                ? "No users found. Create your first user to get started."
                                : "No users found matching your filters."}
                            </TableCell>
                          </TableRow>
                        ) : (
                          paginatedUsers.map((user: any) => (
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
                  {totalUsers > userPageSize && (
                    <div className="border-t border-border/60 px-4 py-3">
                      <PaginationControls
                        page={userCurrentPage}
                        pageSize={userPageSize}
                        totalCount={totalUsers}
                        totalPages={userTotalPages}
                        onPageChange={setUserCurrentPage}
                      />
                    </div>
                  )}
                </div>

                {/* Users (Mobile Cards) */}
                <div className="space-y-3 md:hidden">
                  {usersLoading ? (
                    <Card>
                      <CardContent className="p-4 text-center text-muted-foreground text-sm">Loading users...</CardContent>
                    </Card>
                  ) : filteredUsers.length === 0 ? (
                    <Card>
                      <CardContent className="p-4 text-center text-muted-foreground text-sm">
                        {(users as any[]).length === 0
                          ? "No users found. Create your first user to get started."
                          : "No users found matching your filters."}
                      </CardContent>
                    </Card>
                  ) : (
                    <>
                      {paginatedUsers.map((user: any) => (
                        <Card key={user.id} className="p-4" data-testid={`card-user-${user.id}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <h3 className="text-sm font-medium break-words">{user.firstName} {user.lastName}</h3>
                              <p className="text-xs text-muted-foreground break-words">{user.email}</p>
                              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  <span className="text-muted-foreground">Role</span>
                                  <div className="mt-0.5">
                                    <Badge variant="outline" className={getRoleBadgeColor(user.role)}>
                                      {user.role.replace('_', ' ').toUpperCase()}
                                    </Badge>
                                  </div>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Status</span>
                                  <div className="mt-0.5">
                                    <Badge variant={user.status === 'active' ? 'default' : user.status === 'disabled' ? 'destructive' : 'secondary'}>
                                      {user.status.toUpperCase()}
                                    </Badge>
                                  </div>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Department</span>
                                  <div className="mt-0.5">{user.department?.name || 'Not Assigned'}</div>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Division</span>
                                  <div className="mt-0.5">{user.division?.name || 'Not Assigned'}</div>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center justify-start gap-2 mt-3 pt-3 border-t">
                            <Button variant="ghost" size="sm" onClick={() => handleEditUser(user)}>Edit</Button>
                            {user.status === 'disabled' ? (
                              <Button variant="ghost" size="sm" onClick={() => handleEnableUser(user)}>Enable</Button>
                            ) : (
                              <Button variant="ghost" size="sm" onClick={() => handleDisableUser(user)} className="text-destructive">Disable</Button>
                            )}
                          </div>
                        </Card>
                      ))}
                      {totalUsers > userPageSize && (
                        <div className="pt-2">
                          <PaginationControls
                            page={userCurrentPage}
                            pageSize={userPageSize}
                            totalCount={totalUsers}
                            totalPages={userTotalPages}
                            onPageChange={setUserCurrentPage}
                            className="justify-center"
                          />
                        </div>
                      )}
                    </>
                  )}
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
                  Are you sure you want to disable {disablingUser ? `${disablingUser.firstName} ${disablingUser.lastName}` : ''}?
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
                            {`${u.firstName} ${u.lastName}`} - {u.role.replace('_', ' ').toUpperCase()}
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
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto">
                <Table className="min-w-full">
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
                    ) : (hiringStages as any[]).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No hiring stages found. Create your first hiring stage to get started.
                        </TableCell>
                      </TableRow>
                    ) : (
                      (hiringStages as any[]).map((stage: any) => (
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
                </div>

                {/* Mobile Cards */}
                <div className="space-y-3 p-4 md:hidden">
                  {hiringStagesLoading ? (
                    <div className="text-center py-6 text-muted-foreground text-sm">Loading hiring stages...</div>
                  ) : (hiringStages as any[]).length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground text-sm">No hiring stages found. Create your first hiring stage to get started.</div>
                  ) : (
                    (hiringStages as any[]).map((stage: any) => (
                      <div key={stage.id} className="p-4 border rounded-lg" data-testid={`card-hiring-stage-${stage.id}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium break-words">{stage.name}</div>
                            <p className="text-xs text-muted-foreground break-words">{stage.description || '-'}</p>
                            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <span className="text-muted-foreground">Order</span>
                                <div className="mt-0.5">{stage.orderIndex}</div>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Status</span>
                                <div className="mt-0.5">
                                  <Badge variant={stage.isActive ? 'default' : 'secondary'}>
                                    {stage.isActive ? 'Active' : 'Inactive'}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => handleEditHiringStage(stage)}>Edit</Button>
                            <Button variant="ghost" size="sm" onClick={() => deleteHiringStageMutation.mutate(stage.id)} className="text-destructive">Delete</Button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* Authentication Providers */}
        {canManageAuthProviders && (
          <TabsContent value="authentication" className="space-y-6">
            <AuthenticationProvidersCard />
            <LdapSettingsCard />
          </TabsContent>
        )}

        {/* System Settings */}
        {canManageSystem && (
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
                      <p className="font-medium">Auto regress on prior-stage open</p>
                      <p className="text-sm text-muted-foreground">If enabled, regress to earliest stage with an open task.</p>
                    </div>
                    <Switch
                      checked={!!(systemSettings as any)?.auto_regress_on_prior_open}
                      onCheckedChange={(v) => toggleAutoRegress.mutate(v)}
                      data-testid="switch-auto-regress-prior-open"
                    />
                  </div>

                  {/* Existing placeholder settings retained below */}
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
                  <div className="space-x-3">
                    <Button variant="outline" className="justify-start" data-testid="button-export-data">
                      Export My Data
                    </Button>
                    <Button variant="outline" className="justify-start" data-testid="button-privacy-settings">
                      Privacy Settings
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

  {/* Archive Department Dialog */}
  <AlertDialog open={isArchiveDepartmentDialogOpen} onOpenChange={setIsArchiveDepartmentDialogOpen}>
        <AlertDialogContent data-testid="dialog-archive-department">
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Department</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to archive <strong>{archivingDepartment?.name}</strong>? 
              This will hide the department from the active list. You can restore it later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-archive-department">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmArchiveDepartment}
              disabled={archiveDepartmentMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-archive-department"
            >
              {archiveDepartmentMutation.isPending ? "Archiving..." : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
  </AlertDialog>

  {/* Restore Department Dialog */}
  <AlertDialog open={isRestoreDepartmentDialogOpen} onOpenChange={setIsRestoreDepartmentDialogOpen}>
    <AlertDialogContent data-testid="dialog-restore-department">
      <AlertDialogHeader>
        <AlertDialogTitle>Restore Department</AlertDialogTitle>
        <AlertDialogDescription>
          Are you sure you want to restore <strong>{restoringDepartment?.name}</strong>? This will make the department active again.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel data-testid="button-cancel-restore-department">Cancel</AlertDialogCancel>
        <AlertDialogAction 
          onClick={handleConfirmRestoreDepartment}
          disabled={restoreDepartmentMutation.isPending}
          data-testid="button-confirm-restore-department"
        >
          {restoreDepartmentMutation.isPending ? "Restoring..." : "Restore"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>

  {/* Archive Division Dialog */}
  <AlertDialog open={isArchiveDivisionDialogOpen} onOpenChange={setIsArchiveDivisionDialogOpen}>
        <AlertDialogContent data-testid="dialog-archive-division">
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Division</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to archive <strong>{archivingDivision?.name}</strong>? 
              This will hide the division from the active list. You can restore it later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-archive-division">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmArchiveDivision}
              disabled={archiveDivisionMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-archive-division"
            >
              {archiveDivisionMutation.isPending ? "Archiving..." : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
  </AlertDialog>

  {/* Restore Division Dialog */}
  <AlertDialog open={isRestoreDivisionDialogOpen} onOpenChange={setIsRestoreDivisionDialogOpen}>
    <AlertDialogContent data-testid="dialog-restore-division">
      <AlertDialogHeader>
        <AlertDialogTitle>Restore Division</AlertDialogTitle>
        <AlertDialogDescription>
          Are you sure you want to restore <strong>{restoringDivision?.name}</strong>? This will make the division active again.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel data-testid="button-cancel-restore-division">Cancel</AlertDialogCancel>
        <AlertDialogAction 
          onClick={handleConfirmRestoreDivision}
          disabled={restoreDivisionMutation.isPending}
          data-testid="button-confirm-restore-division"
        >
          {restoreDivisionMutation.isPending ? "Restoring..." : "Restore"}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
    </div>
  );
}
