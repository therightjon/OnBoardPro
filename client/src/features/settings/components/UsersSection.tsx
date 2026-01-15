/**
 * UsersSection - User management for system admins
 * Includes: user list, create/edit, invite, disable/enable, task reassignment
 */
import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Users,
  Plus,
  Edit,
  Archive,
  Send,
  Search,
  X,
} from "lucide-react";

import { useAuth } from "@/features/auth/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/shared/hooks/use-toast";
import { useSortableTable } from "@/shared/hooks/use-sortable-table";
import { SortableTableHeader } from "@/shared/components/sortable-table-header";

// UI Components
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Badge } from "@/shared/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/shared/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { PaginationControls } from "@/shared/components/pagination-controls";

// ============================================================================
// SCHEMAS
// ============================================================================

const userSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Valid email is required"),
  passwordHash: z.string(),
  role: z.string().min(1, "Role is required"),
  status: z.string().min(1, "Status is required"),
  departmentId: z.string().min(1, "Department is required"),
  divisionId: z.string().min(1, "Division is required"),
});

// Password validation matching server-side policy (server/utils/passwords.ts)
const passwordValidation = z.string()
  .min(12, "Password must be at least 12 characters")
  .max(128, "Password must not exceed 128 characters")
  .regex(/[A-Z]/, "Password must include an uppercase letter")
  .regex(/[a-z]/, "Password must include a lowercase letter")
  .regex(/[0-9]/, "Password must include a number")
  .regex(/[^A-Za-z0-9]/, "Password must include a special character");

const createUserSchema = userSchema.extend({
  passwordHash: passwordValidation,
});

const editUserSchema = userSchema.extend({
  passwordHash: z.string().optional(),
});

const inviteSchema = z.object({
  email: z.string().email("Valid email is required"),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  roles: z.array(z.string()).min(1, "Select at least one role"),
  departmentId: z.string().optional(),
  divisionId: z.string().optional(),
});

type UserForm = z.infer<typeof createUserSchema> | z.infer<typeof editUserSchema>;
type InviteForm = z.infer<typeof inviteSchema>;

// ============================================================================
// CONSTANTS
// ============================================================================

const USERS_PAGE_SIZE = 5;

type UserSortKey = "name" | "email" | "role" | "status" | "department" | "division" | "lastLogin";

const inviteRoleOptions = [
  { value: "system_admin", label: "System Admin" },
  { value: "hr_staff", label: "HR Staff" },
  { value: "department_admin", label: "Department Admin" },
  { value: "division_leader", label: "Division Leader" },
  { value: "manager", label: "Manager" },
  { value: "candidate", label: "Candidate" },
];

const roleBadgeBase = "rounded-sm font-medium transition-colors shadow-none";

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
      "bg-neutral-100 dark:bg-neutral-800/40 text-neutral-700 dark:text-neutral-200 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-200/60 dark:hover:bg-neutral-700",
  };
  return `${roleBadgeBase} ${map[role] || map.default}`;
};

// ============================================================================
// USERS SECTION COMPONENT
// ============================================================================

export function UsersSection() {
  const { user } = useAuth();
  const { toast } = useToast();

  // ---- State ----
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [isDisableDialogOpen, setIsDisableDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [disablingUser, setDisablingUser] = useState<any | null>(null);
  const [reassignTo, setReassignTo] = useState("");

  // Search & Filter
  const [userSearchTerm, setUserSearchTerm] = useState("");
  const [userStatusFilter, setUserStatusFilter] = useState("all");
  const [userRoleFilter, setUserRoleFilter] = useState("all");

  // Pagination
  const [userCurrentPage, setUserCurrentPage] = useState(1);
  const userPageSize = USERS_PAGE_SIZE;

  // ---- Forms ----
  const userForm = useForm<UserForm>({
    resolver: zodResolver(editingUser ? editUserSchema : createUserSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      passwordHash: "",
      role: "",
      status: "active",
      departmentId: "",
      divisionId: "",
    },
  });

  const inviteForm = useForm<InviteForm>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      roles: [],
      departmentId: "",
      divisionId: "",
    },
  });

  const selectedInviteRoles = inviteForm.watch("roles") || [];
  const selectedUserDepartmentId = userForm.watch("departmentId");
  const selectedInviteDepartmentId = inviteForm.watch("departmentId");

  // ---- Queries ----
  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ["/api/users", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/users");
      return res.json();
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ["/api/departments", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/departments");
      return res.json();
    },
  });

  const { data: divisionsForUserDept = [] } = useQuery({
    queryKey: ["/api/divisions", selectedUserDepartmentId, user?.id],
    enabled: !!user && !!selectedUserDepartmentId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/divisions?departmentId=${selectedUserDepartmentId}`);
      return res.json();
    },
  });

  const { data: divisionsForInviteDept = [] } = useQuery({
    queryKey: ["/api/divisions", selectedInviteDepartmentId, "invite", user?.id],
    enabled: !!user && !!selectedInviteDepartmentId,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/divisions?departmentId=${selectedInviteDepartmentId}`);
      return res.json();
    },
  });

  // Task count for user being disabled
  const { data: userTaskCount } = useQuery({
    queryKey: ["/api/users", disablingUser?.id, "task-count"],
    enabled: !!disablingUser?.id,
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/users/${disablingUser.id}/task-count`);
      return res.json();
    },
  });

  // Filter and paginate users
  const filteredUsers = useMemo(() => {
    let result = [...(users as any[])];

    // Search
    if (userSearchTerm) {
      const search = userSearchTerm.toLowerCase();
      result = result.filter(
        (u) =>
          u.firstName?.toLowerCase().includes(search) ||
          u.lastName?.toLowerCase().includes(search) ||
          u.email?.toLowerCase().includes(search)
      );
    }

    // Status filter
    if (userStatusFilter !== "all") {
      result = result.filter((u) => u.status === userStatusFilter);
    }

    // Role filter
    if (userRoleFilter !== "all") {
      result = result.filter((u) => u.role === userRoleFilter);
    }

    return result;
  }, [users, userSearchTerm, userStatusFilter, userRoleFilter]);

  const sortableColumns = useMemo<Record<UserSortKey, { getValue?: (row: any) => string | number | boolean | Date | null | undefined }>>(
    () => ({
      name: {
        getValue: (u: any) => `${u.firstName || ""} ${u.lastName || ""}`.trim().toLowerCase(),
      },
      email: {
        getValue: (u: any) => u.email || "",
      },
      role: {
        getValue: (u: any) => u.role || "",
      },
      status: {
        getValue: (u: any) => u.status || "",
      },
      department: {
        getValue: (u: any) => u.department?.name || "",
      },
      division: {
        getValue: (u: any) => u.division?.name || "",
      },
      lastLogin: {
        getValue: (u: any) => u.lastLoginAt ? new Date(u.lastLoginAt) : null,
      },
    }),
    []
  );

  const { sortedRows: sortedUsers, sortState, toggleSort } = useSortableTable<any, UserSortKey>({
    rows: filteredUsers,
    columns: sortableColumns,
  });

  const totalUsers = sortedUsers.length;
  const userTotalPages = Math.ceil(totalUsers / userPageSize);
  const paginatedUsers = sortedUsers.slice(
    (userCurrentPage - 1) * userPageSize,
    userCurrentPage * userPageSize
  );

  // Reset page when filters change
  useEffect(() => {
    setUserCurrentPage(1);
  }, [userSearchTerm, userStatusFilter, userRoleFilter]);

  useEffect(() => {
    setUserCurrentPage((prev) => Math.min(prev, userTotalPages || 1));
  }, [userTotalPages]);

  useEffect(() => {
    setUserCurrentPage(1);
  }, [sortState]);

  // Users available for task reassignment
  const reassignableUsers = useMemo(() => {
    return (users as any[]).filter(
      (u) => u.id !== disablingUser?.id && u.status === "active"
    );
  }, [users, disablingUser]);

  // ---- Mutations ----
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
      toast({ title: "Success", description: "User created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
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
      toast({ title: "Success", description: "User updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
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
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Invitation sent", description: "Invite email was queued for delivery." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to send invite", description: error.message, variant: "destructive" });
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
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const enableUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("POST", `/api/users/${userId}/enable`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Success", description: "User enabled successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const cancelInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const res = await apiRequest("DELETE", `/api/invitations/${invitationId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Success", description: "Invitation canceled successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // ---- Handlers ----
  const handleNewUser = () => {
    setEditingUser(null);
    userForm.reset({
      firstName: "",
      lastName: "",
      email: "",
      passwordHash: "",
      role: "",
      status: "active",
      departmentId: "",
      divisionId: "",
    });
    setIsUserDialogOpen(true);
  };

  const handleEditUser = (u: any) => {
    // Prevent editing of invited users (pseudo-users from invitations table)
    if (u.id?.startsWith('invite:')) {
      toast({
        title: "Cannot edit invited user",
        description: "Invited users must complete registration before they can be edited. You can resend the invitation or cancel it instead.",
        variant: "destructive"
      });
      return;
    }

    setEditingUser(u);
    userForm.reset({
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      passwordHash: "",
      role: u.role,
      status: u.status,
      departmentId: u.departmentId || "",
      divisionId: u.divisionId || "",
    });
    setIsUserDialogOpen(true);
  };

  const handleDisableUser = (u: any) => {
    // Prevent disabling invited users
    if (u.id?.startsWith('invite:')) {
      toast({
        title: "Cannot disable invited user",
        description: "Invited users are not active yet. You can cancel their invitation instead.",
        variant: "destructive"
      });
      return;
    }

    setDisablingUser(u);
    setReassignTo("");
    setIsDisableDialogOpen(true);
  };

  const handleEnableUser = (u: any) => {
    // Prevent enabling invited users
    if (u.id?.startsWith('invite:')) {
      toast({
        title: "Cannot enable invited user",
        description: "Invited users must complete registration first.",
        variant: "destructive"
      });
      return;
    }

    enableUserMutation.mutate(u.id);
  };

  const handleCancelInvitation = (u: any) => {
    // Extract the actual invitation ID from the pseudo-user ID format "invite:actual-id"
    if (!u.id?.startsWith('invite:')) {
      toast({
        title: "Invalid invitation",
        description: "This is not a pending invitation.",
        variant: "destructive"
      });
      return;
    }

    const invitationId = u.id.replace('invite:', '');
    cancelInvitationMutation.mutate(invitationId);
  };

  const handleConfirmDisable = () => {
    if (!disablingUser) return;
    disableUserMutation.mutate({
      userId: disablingUser.id,
      reassignOpenTasksTo: reassignTo === "unassigned" ? undefined : reassignTo || undefined,
    });
  };

  const onUserSubmit = (data: UserForm) => {
    if (editingUser) {
      const payload: any = { ...data, id: editingUser.id };
      if (!payload.passwordHash) delete payload.passwordHash;
      updateUserMutation.mutate(payload);
    } else {
      createUserMutation.mutate(data);
    }
  };

  const onInviteSubmit = (data: InviteForm) => {
    sendInviteMutation.mutate(data);
  };

  const toggleInviteRole = (role: string, checked: boolean) => {
    const current = inviteForm.getValues("roles") || [];
    if (checked) {
      inviteForm.setValue("roles", [...current, role]);
    } else {
      inviteForm.setValue("roles", current.filter((r) => r !== role));
    }
  };

  // ---- Render ----
  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center">
              <Users className="w-4 h-4 mr-2" />
              User Management
            </CardTitle>
            <div className="flex items-center gap-2">
              {/* Invite Dialog */}
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
                    <DialogDescription className="sr-only">
                      Send an invitation email to add new users to the system.
                    </DialogDescription>
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
                        <p className="text-sm text-destructive mt-1">{inviteForm.formState.errors.email.message}</p>
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
                      <Select
                        onValueChange={(value) => {
                          inviteForm.setValue("departmentId", value);
                          inviteForm.setValue("divisionId", "");
                        }}
                        value={inviteForm.watch("departmentId") || ""}
                      >
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
                      <Select
                        onValueChange={(value) => inviteForm.setValue("divisionId", value)}
                        value={inviteForm.watch("divisionId") || ""}
                        disabled={!inviteForm.watch("departmentId")}
                      >
                        <SelectTrigger data-testid="select-invite-division">
                          <SelectValue placeholder="Select division" />
                        </SelectTrigger>
                        <SelectContent>
                          {!inviteForm.watch("departmentId") || divisionsForInviteDept.length === 0 ? (
                            <SelectItem disabled value="__no_divisions__">
                              No divisions available.
                            </SelectItem>
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
                        <p className="text-sm text-destructive mt-1">{inviteForm.formState.errors.roles.message}</p>
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

              {/* New User Dialog */}
              <Dialog open={isUserDialogOpen} onOpenChange={setIsUserDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={handleNewUser} data-testid="button-new-user">
                    <Plus className="w-4 h-4 mr-2" />
                    New User
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-[95vw] w-full sm:max-w-md max-h-[90vh] sm:max-h-min overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{editingUser ? "Edit User" : "Create New User"}</DialogTitle>
                    <DialogDescription className="sr-only">
                      {editingUser ? "Update user details and permissions." : "Create a new user account with role and department assignments."}
                    </DialogDescription>
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
                          <p className="text-sm text-destructive mt-1">{userForm.formState.errors.firstName.message}</p>
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
                          <p className="text-sm text-destructive mt-1">{userForm.formState.errors.lastName.message}</p>
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
                        <p className="text-sm text-destructive mt-1">{userForm.formState.errors.email.message}</p>
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
                        <p className="text-sm text-destructive mt-1">{userForm.formState.errors.passwordHash.message}</p>
                      )}
                      {!editingUser && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Must be 12+ characters with uppercase, lowercase, number, and special character
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
                        <p className="text-sm text-destructive mt-1">{userForm.formState.errors.role.message}</p>
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
                        <p className="text-sm text-destructive mt-1">{userForm.formState.errors.status.message}</p>
                      )}
                    </div>

                    <div>
                      <Label htmlFor="user-department">Department</Label>
                      <Select
                        onValueChange={(value) => {
                          userForm.setValue("departmentId", value);
                          userForm.setValue("divisionId", "");
                        }}
                        value={userForm.watch("departmentId")}
                      >
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
                        <p className="text-sm text-destructive mt-1">{userForm.formState.errors.departmentId.message}</p>
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
                          {!selectedUserDepartmentId || divisionsForUserDept.length === 0 ? (
                            <SelectItem disabled value="__no_divisions__">
                              No divisions available.
                            </SelectItem>
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
                        <p className="text-sm text-destructive mt-1">{userForm.formState.errors.divisionId.message}</p>
                      )}
                    </div>

                    <div className="flex justify-end space-x-2">
                      <Button type="button" variant="outline" onClick={() => setIsUserDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={createUserMutation.isPending || updateUserMutation.isPending}>
                        {createUserMutation.isPending || updateUserMutation.isPending
                          ? editingUser
                            ? "Updating..."
                            : "Creating..."
                          : editingUser
                          ? "Update User"
                          : "Create User"}
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
                    <SortableTableHeader
                      columnKey="name"
                      label="Name"
                      direction={sortState.key === "name" ? sortState.direction : null}
                      onSort={toggleSort}
                    />
                    <SortableTableHeader
                      columnKey="email"
                      label="Email"
                      direction={sortState.key === "email" ? sortState.direction : null}
                      onSort={toggleSort}
                    />
                    <SortableTableHeader
                      columnKey="role"
                      label="Role"
                      direction={sortState.key === "role" ? sortState.direction : null}
                      onSort={toggleSort}
                    />
                    <SortableTableHeader
                      columnKey="status"
                      label="Status"
                      direction={sortState.key === "status" ? sortState.direction : null}
                      onSort={toggleSort}
                    />
                    <SortableTableHeader
                      columnKey="department"
                      label="Department"
                      direction={sortState.key === "department" ? sortState.direction : null}
                      onSort={toggleSort}
                    />
                    <SortableTableHeader
                      columnKey="division"
                      label="Division"
                      direction={sortState.key === "division" ? sortState.direction : null}
                      onSort={toggleSort}
                    />
                    <SortableTableHeader
                      columnKey="lastLogin"
                      label="Last Login"
                      direction={sortState.key === "lastLogin" ? sortState.direction : null}
                      onSort={toggleSort}
                    />
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
                  ) : sortedUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        {(users as any[]).length === 0
                          ? "No users found. Create your first user to get started."
                          : "No users found matching your filters."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedUsers.map((u: any) => (
                      <TableRow key={u.id} className="hover:bg-muted/50" data-testid={`row-user-${u.id}`}>
                        <TableCell className="font-medium">
                          {u.firstName} {u.lastName}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{u.email}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getRoleBadgeColor(u.role)}>
                            {u.role.replace("_", " ").toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={u.status === "active" ? "default" : u.status === "disabled" ? "destructive" : "secondary"}
                          >
                            {u.status.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{u.department?.name || "Not Assigned"}</TableCell>
                        <TableCell className="text-muted-foreground">{u.division?.name || "Not Assigned"}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "Never"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditUser(u)}
                              disabled={u.id?.startsWith('invite:')}
                              data-testid={`button-edit-user-${u.id}`}
                              title={u.id?.startsWith('invite:') ? "Invited users cannot be edited until they complete registration" : "Edit user"}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            {u.status === "active" ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive"
                                onClick={() => handleDisableUser(u)}
                                data-testid={`button-disable-user-${u.id}`}
                              >
                                <Archive className="w-4 h-4" />
                              </Button>
                            ) : u.status === "invited" ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive"
                                onClick={() => handleCancelInvitation(u)}
                                data-testid={`button-cancel-invitation-${u.id}`}
                                title="Cancel invitation"
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-green-600 dark:text-emerald-400"
                                onClick={() => handleEnableUser(u)}
                                data-testid={`button-enable-user-${u.id}`}
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
            ) : sortedUsers.length === 0 ? (
              <Card>
                <CardContent className="p-4 text-center text-muted-foreground text-sm">
                  {(users as any[]).length === 0
                    ? "No users found. Create your first user to get started."
                    : "No users found matching your filters."}
                </CardContent>
              </Card>
            ) : (
              <>
                {paginatedUsers.map((u: any) => (
                  <Card key={u.id} className="p-4" data-testid={`card-user-${u.id}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-medium break-words">
                          {u.firstName} {u.lastName}
                        </h3>
                        <p className="text-xs text-muted-foreground break-words">{u.email}</p>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-muted-foreground">Role</span>
                            <div className="mt-0.5">
                              <Badge variant="outline" className={getRoleBadgeColor(u.role)}>
                                {u.role.replace("_", " ").toUpperCase()}
                              </Badge>
                            </div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Status</span>
                            <div className="mt-0.5">
                              <Badge
                                variant={
                                  u.status === "active" ? "default" : u.status === "disabled" ? "destructive" : "secondary"
                                }
                              >
                                {u.status.toUpperCase()}
                              </Badge>
                            </div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Department</span>
                            <div className="mt-0.5">{u.department?.name || "Not Assigned"}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Division</span>
                            <div className="mt-0.5">{u.division?.name || "Not Assigned"}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-start gap-2 mt-3 pt-3 border-t">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditUser(u)}
                        disabled={u.id?.startsWith('invite:')}
                      >
                        Edit
                      </Button>
                      {u.status === "invited" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCancelInvitation(u)}
                          className="text-destructive"
                        >
                          Cancel
                        </Button>
                      ) : u.status === "disabled" ? (
                        <Button variant="ghost" size="sm" onClick={() => handleEnableUser(u)}>
                          Enable
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDisableUser(u)}
                          className="text-destructive"
                        >
                          Disable
                        </Button>
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

      {/* Disable User Dialog */}
      <Dialog open={isDisableDialogOpen} onOpenChange={setIsDisableDialogOpen}>
        <DialogContent className="max-w-[95vw] w-full sm:max-w-md max-h-[90vh] sm:max-h-min overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Disable User</DialogTitle>
            <DialogDescription className="sr-only">
              Disable this user's account and optionally reassign their tasks.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-orange-50 dark:bg-orange-950 p-4 rounded-lg">
              <p className="text-sm font-medium text-orange-800 dark:text-orange-200">
                Are you sure you want to disable {disablingUser ? `${disablingUser.firstName} ${disablingUser.lastName}` : ""}?
              </p>
              <p className="text-sm text-orange-600 dark:text-orange-400 mt-1">
                This will prevent them from logging in and accessing the system.
              </p>
            </div>

            {userTaskCount && userTaskCount.total > 0 && (
              <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg">
                <p className="text-sm font-medium text-blue-800 dark:text-blue-200">Task Assignment</p>
                <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                  This user has {userTaskCount.total} open task(s) ({userTaskCount.required} required). You can reassign
                  them to another user.
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
                          {`${u.firstName} ${u.lastName}`} - {u.role.replace("_", " ").toUpperCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={() => setIsDisableDialogOpen(false)}>
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
    </>
  );
}

export default UsersSection;
