/**
 * OrganizationSettings - Departments and Divisions management
 * System-level settings for organizational structure
 */
import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Building, Users, Plus, Edit, Archive, RotateCcw, Search } from "lucide-react";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { apiRequest, queryClient, parseJsonSafe } from "@/lib/queryClient";
import { useToast } from "@/shared/hooks/use-toast";
import { useSortableTable, type SortDirection } from "@/shared/hooks/use-sortable-table";
import { SortableTableHeader } from "@/shared/components/sortable-table-header";
import { insertDepartmentSchema, insertDivisionSchema } from "@shared/schemas";

// UI Components
import { SettingsSection } from "@/shared/components/settings/SettingsSection";
import { ConfirmationDialog } from "@/shared/components/settings/ConfirmationDialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Badge } from "@/shared/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/shared/components/ui/dialog";

// Schemas
const departmentSchema = insertDepartmentSchema.pick({ name: true });
const divisionSchema = insertDivisionSchema.pick({ name: true, departmentId: true });

type DepartmentForm = z.infer<typeof departmentSchema>;
type DivisionForm = z.infer<typeof divisionSchema>;

type DepartmentSortKey = "name" | "status" | "createdAt";

// Helper to detect archived status across different data shapes
function isEntityArchived(entity: any): boolean {
  if (!entity) return false;
  if (typeof entity.archived === "boolean") return entity.archived;
  if (typeof entity.archived === "number") return entity.archived === 1;
  if (typeof entity.archived === "string") {
    const v = entity.archived.toLowerCase();
    return v === "true" || v === "1" || v === "yes";
  }
  if (typeof entity.isArchived === "boolean") return entity.isArchived;
  if (typeof entity.status === "string") return entity.status.toLowerCase() === "archived";
  if (entity.archivedAt) return true;
  if (typeof entity.isActive === "boolean") return !entity.isActive;
  return false;
}

interface DepartmentTableProps {
  departments: any[];
  isLoading: boolean;
  isError: boolean;
  searchTerm: string;
  archiveFilter: string;
  sortState: { key: DepartmentSortKey | null; direction: SortDirection };
  toggleSort: (key: DepartmentSortKey) => void;
  onEdit: (dept: any) => void;
  onArchive: (dept: any) => void;
  onRestore: (dept: any) => void;
  onRetry: () => void;
}

function DepartmentTable({
  departments,
  isLoading,
  isError,
  searchTerm,
  archiveFilter,
  sortState,
  toggleSort,
  onEdit,
  onArchive,
  onRestore,
  onRetry,
}: DepartmentTableProps) {
  const filtered = useMemo(() => {
    return departments.filter((dept) => {
      if (!dept) return false;
      const archived = isEntityArchived(dept);
      if (archiveFilter === "active" && archived) return false;
      if (archiveFilter === "archived" && !archived) return false;
      return dept.name.toLowerCase().includes(searchTerm.toLowerCase());
    });
  }, [departments, searchTerm, archiveFilter]);

  const sortableColumns = useMemo<Record<DepartmentSortKey, { getValue?: (row: any) => string | number | boolean | Date | null | undefined }>>(() => ({
    name: { getValue: (dept: any) => dept.name || "" },
    status: { getValue: (dept: any) => isEntityArchived(dept) ? 0 : 1 },
    createdAt: { getValue: (dept: any) => dept.createdAt ? new Date(dept.createdAt) : null },
  }), []);

  const { sortedRows: sortedDepts } = useSortableTable<any, DepartmentSortKey>({
    rows: filtered,
    columns: sortableColumns,
    initialState: sortState.key ? { key: sortState.key, direction: sortState.direction } : undefined,
  });

  // Use sorted data for rendering
  const displayDepts = sortState.key ? sortedDepts : filtered;

  if (isError) {
    return (
      <div className="text-center py-8">
        <span className="text-destructive">Failed to load departments.</span>
        <Button size="sm" variant="outline" onClick={onRetry} className="ml-3">
          Retry
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return <div className="text-center py-8 animate-pulse">Loading departments...</div>;
  }

  if (filtered.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        {departments.length === 0
          ? "No departments found. Create your first department to get started."
          : "No departments match your search criteria."}
      </div>
    );
  }

  return (
    <>
      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto">
        <Table className="min-w-[700px]">
          <TableHeader>
            <TableRow>
              <SortableTableHeader
                columnKey="name"
                label="Name"
                direction={sortState.key === "name" ? sortState.direction : null}
                onSort={toggleSort}
              />
              <SortableTableHeader
                columnKey="status"
                label="Status"
                direction={sortState.key === "status" ? sortState.direction : null}
                onSort={toggleSort}
              />
              <SortableTableHeader
                columnKey="createdAt"
                label="Created"
                direction={sortState.key === "createdAt" ? sortState.direction : null}
                onSort={toggleSort}
              />
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayDepts.map((dept) => (
              <TableRow key={dept.id} data-testid={`row-department-${dept.id}`}>
                <TableCell className="font-medium">{dept.name}</TableCell>
                <TableCell>
                  <Badge variant={isEntityArchived(dept) ? "secondary" : "default"}>
                    {isEntityArchived(dept) ? "Archived" : "Active"}
                  </Badge>
                </TableCell>
                <TableCell>{new Date(dept.createdAt).toLocaleDateString()}</TableCell>
                <TableCell>
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(dept)}
                      aria-label={`Edit ${dept.name}`}
                      data-testid={`button-edit-department-${dept.id}`}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    {isEntityArchived(dept) ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onRestore(dept)}
                        aria-label={`Restore ${dept.name}`}
                        data-testid={`button-restore-department-${dept.id}`}
                      >
                        <RotateCcw className="w-4 h-4" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onArchive(dept)}
                        aria-label={`Archive ${dept.name}`}
                        data-testid={`button-archive-department-${dept.id}`}
                      >
                        <Archive className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Cards */}
      <div className="space-y-3 md:hidden">
        {displayDepts.map((dept) => (
          <div key={dept.id} className="p-4 border rounded-lg" data-testid={`card-department-${dept.id}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium break-words">{dept.name}</div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Status</span>
                    <div className="mt-0.5">
                      <Badge variant={isEntityArchived(dept) ? "secondary" : "default"}>
                        {isEntityArchived(dept) ? "Archived" : "Active"}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Created</span>
                    <div className="mt-0.5">{new Date(dept.createdAt).toLocaleDateString()}</div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => onEdit(dept)}>
                  Edit
                </Button>
                {isEntityArchived(dept) ? (
                  <Button variant="ghost" size="sm" onClick={() => onRestore(dept)}>
                    Restore
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => onArchive(dept)}>
                    Archive
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function DepartmentsSection() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  // State
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<any>(null);
  const [archivingDepartment, setArchivingDepartment] = useState<any>(null);
  const [restoringDepartment, setRestoringDepartment] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [archiveFilter, setArchiveFilter] = useState("active");
  const [sortState, setSortState] = useState<{ key: DepartmentSortKey | null; direction: SortDirection }>({ key: null, direction: null });

  const toggleSort = (key: DepartmentSortKey) => {
    setSortState((prev) => {
      if (prev.key !== key) return { key, direction: "asc" };
      if (prev.direction === "asc") return { key, direction: "desc" };
      return { key: null, direction: null };
    });
  };

  // Form
  const form = useForm<DepartmentForm>({
    resolver: zodResolver(departmentSchema),
    defaultValues: { name: "" },
  });

  // Query
  const { data: departments = [], isLoading, isError } = useQuery({
    queryKey: ["/api/departments", user?.id, { includeArchived: true }],
    enabled: !!user,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/departments?includeArchived=true");
      return res.json();
    },
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: async (data: DepartmentForm) => {
      const res = await apiRequest("POST", "/api/departments", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/departments"], exact: false });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: "Department created", description: "The department was created successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<DepartmentForm> }) => {
      const res = await apiRequest("PATCH", `/api/departments/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/departments"], exact: false });
      setIsDialogOpen(false);
      setEditingDepartment(null);
      form.reset();
      toast({ title: "Department updated", description: "The department was updated successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/departments/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/departments"], exact: false });
      setArchivingDepartment(null);
      toast({ title: "Department archived", description: "The department was archived successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/departments/${id}/restore`);
      return parseJsonSafe(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/departments"], exact: false });
      setRestoringDepartment(null);
      toast({ title: "Department restored", description: "The department was restored successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Handlers
  const handleNewDepartment = () => {
    setEditingDepartment(null);
    form.reset({ name: "" });
    setIsDialogOpen(true);
  };

  const handleEditDepartment = (dept: any) => {
    setEditingDepartment(dept);
    form.reset({ name: dept.name });
    setIsDialogOpen(true);
  };

  const handleSubmit = (data: DepartmentForm) => {
    if (editingDepartment) {
      updateMutation.mutate({ id: editingDepartment.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <>
      <SettingsSection
        title="Departments"
        description="Manage organizational departments. Departments group related divisions together."
        icon={Building}
        actions={
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={handleNewDepartment} data-testid="button-new-department">
                <Plus className="w-4 h-4 mr-2" />
                New Department
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-min">
              <DialogHeader>
                <DialogTitle>
                  {editingDepartment ? "Edit Department" : "Create Department"}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  {editingDepartment ? "Update department name." : "Create a new department for your organization."}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <div>
                  <Label htmlFor="dept-name">Department Name</Label>
                  <Input
                    id="dept-name"
                    placeholder="e.g., Engineering, Human Resources"
                    {...form.register("name")}
                    data-testid="input-department-name"
                  />
                  {form.formState.errors.name && (
                    <p className="text-sm text-destructive mt-1">
                      {form.formState.errors.name.message}
                    </p>
                  )}
                </div>
                <div className="flex justify-end space-x-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsDialogOpen(false);
                      setEditingDepartment(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                  >
                    {createMutation.isPending || updateMutation.isPending
                      ? "Saving..."
                      : editingDepartment
                      ? "Update"
                      : "Create"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        }
        data-testid="settings-section-departments"
      >
        {/* Search and Filter */}
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search departments..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search-departments"
              />
            </div>
          </div>
          <Select value={archiveFilter} onValueChange={setArchiveFilter}>
            <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-department-archive-filter">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              <SelectItem value="active">Active Only</SelectItem>
              <SelectItem value="archived">Archived Only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <DepartmentTable
          departments={departments as any[]}
          isLoading={isLoading}
          isError={isError}
          searchTerm={searchTerm}
          archiveFilter={archiveFilter}
          sortState={sortState}
          toggleSort={toggleSort}
          onEdit={handleEditDepartment}
          onArchive={setArchivingDepartment}
          onRestore={setRestoringDepartment}
          onRetry={() => queryClient.invalidateQueries({ queryKey: ["/api/departments"], exact: false })}
        />
      </SettingsSection>

      {/* Archive Confirmation */}
      <ConfirmationDialog
        open={!!archivingDepartment}
        onOpenChange={(open) => !open && setArchivingDepartment(null)}
        title="Archive Department"
        description={
          <>
            Are you sure you want to archive <strong>{archivingDepartment?.name}</strong>?
            This will hide the department from the active list. You can restore it later if needed.
          </>
        }
        confirmText="Archive"
        onConfirm={() => archivingDepartment && archiveMutation.mutate(archivingDepartment.id)}
        isPending={archiveMutation.isPending}
        variant="destructive"
        data-testid="dialog-archive-department"
      />

      {/* Restore Confirmation */}
      <ConfirmationDialog
        open={!!restoringDepartment}
        onOpenChange={(open) => !open && setRestoringDepartment(null)}
        title="Restore Department"
        description={
          <>
            Are you sure you want to restore <strong>{restoringDepartment?.name}</strong>?
            This will make the department active again.
          </>
        }
        confirmText="Restore"
        onConfirm={() => restoringDepartment && restoreMutation.mutate(restoringDepartment.id)}
        isPending={restoreMutation.isPending}
        data-testid="dialog-restore-department"
      />
    </>
  );
}

export default DepartmentsSection;
