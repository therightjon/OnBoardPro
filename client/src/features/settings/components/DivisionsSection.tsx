/**
 * DivisionsSection - Divisions management within departments
 * System-level settings for organizational structure
 */
import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Users, Plus, Edit, Archive, RotateCcw, Search } from "lucide-react";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { apiRequest, queryClient, parseJsonSafe } from "@/lib/queryClient";
import { useToast } from "@/shared/hooks/use-toast";
import { useSortableTable } from "@/shared/hooks/use-sortable-table";
import { SortableTableHeader } from "@/shared/components/sortable-table-header";
import { insertDivisionSchema } from "@shared/schemas";

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

// Schema
const divisionSchema = insertDivisionSchema.pick({ name: true, departmentId: true });
type DivisionForm = z.infer<typeof divisionSchema>;

type DivisionSortKey = "name" | "department" | "status" | "createdAt";

// Helper to detect archived status
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

export function DivisionsSection() {
  const { user } = useAuth();
  const { toast } = useToast();

  // State
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingDivision, setEditingDivision] = useState<any>(null);
  const [archivingDivision, setArchivingDivision] = useState<any>(null);
  const [restoringDivision, setRestoringDivision] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [archiveFilter, setArchiveFilter] = useState("active");

  // Form
  const form = useForm<DivisionForm>({
    resolver: zodResolver(divisionSchema),
    defaultValues: { name: "", departmentId: "" },
  });

  // Queries
  const { data: departments = [] } = useQuery({
    queryKey: ["/api/departments", user?.id, { includeArchived: false }],
    enabled: !!user,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/departments");
      return res.json();
    },
  });

  const { data: divisions = [], isLoading, isError } = useQuery({
    queryKey: ["/api/divisions", user?.id, { includeArchived: true }],
    enabled: !!user,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/divisions?includeArchived=true");
      return res.json();
    },
  });

  // Filtered divisions
  const filteredDivisions = useMemo(() => {
    return (divisions as any[]).filter((div) => {
      if (!div) return false;
      const archived = isEntityArchived(div);
      if (archiveFilter === "active" && archived) return false;
      if (archiveFilter === "archived" && !archived) return false;
      if (departmentFilter !== "all" && div.departmentId !== departmentFilter) return false;
      return div.name.toLowerCase().includes(searchTerm.toLowerCase());
    });
  }, [divisions, searchTerm, departmentFilter, archiveFilter]);

  // Get department name helper
  const getDepartmentName = (departmentId: string) => {
    const dept = (departments as any[]).find((d) => d.id === departmentId);
    return dept?.name || "Unknown";
  };

  // Sortable columns configuration
  const sortableColumns = useMemo(() => ({
    name: { key: "name" as const, getValue: (div: any) => div.name?.toLowerCase() || "" },
    department: { key: "department" as const, getValue: (div: any) => getDepartmentName(div.departmentId).toLowerCase() },
    status: { key: "status" as const, getValue: (div: any) => (isEntityArchived(div) ? "archived" : "active") },
    createdAt: { key: "createdAt" as const, getValue: (div: any) => new Date(div.createdAt).getTime() },
  }), [departments]);

  const { sortedRows: displayDivisions, sortState, toggleSort } = useSortableTable<any, DivisionSortKey>({
    rows: filteredDivisions,
    columns: sortableColumns,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: async (data: DivisionForm) => {
      const res = await apiRequest("POST", "/api/divisions", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/divisions"], exact: false });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: "Division created", description: "The division was created successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<DivisionForm> }) => {
      const res = await apiRequest("PATCH", `/api/divisions/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/divisions"], exact: false });
      setIsDialogOpen(false);
      setEditingDivision(null);
      form.reset();
      toast({ title: "Division updated", description: "The division was updated successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/divisions/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/divisions"], exact: false });
      setArchivingDivision(null);
      toast({ title: "Division archived", description: "The division was archived successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/divisions/${id}/restore`);
      return parseJsonSafe(res);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/divisions"], exact: false });
      setRestoringDivision(null);
      toast({ title: "Division restored", description: "The division was restored successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Handlers
  const handleNewDivision = () => {
    setEditingDivision(null);
    form.reset({ name: "", departmentId: "" });
    setIsDialogOpen(true);
  };

  const handleEditDivision = (div: any) => {
    setEditingDivision(div);
    form.reset({ name: div.name, departmentId: div.departmentId });
    setIsDialogOpen(true);
  };

  const handleSubmit = (data: DivisionForm) => {
    if (editingDivision) {
      updateMutation.mutate({ id: editingDivision.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <>
      <SettingsSection
        title="Divisions"
        description="Manage divisions within departments. Divisions represent teams or units within a department."
        icon={Users}
        actions={
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={handleNewDivision} data-testid="button-new-division">
                <Plus className="w-4 h-4 mr-2" />
                New Division
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-min">
              <DialogHeader>
                <DialogTitle>
                  {editingDivision ? "Edit Division" : "Create Division"}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  {editingDivision ? "Update division name and department." : "Create a new division within a department."}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <div>
                  <Label htmlFor="div-name">Division Name</Label>
                  <Input
                    id="div-name"
                    placeholder="e.g., Frontend Team, Recruiting"
                    {...form.register("name")}
                    data-testid="input-division-name"
                  />
                  {form.formState.errors.name && (
                    <p className="text-sm text-destructive mt-1">
                      {form.formState.errors.name.message}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="div-department">Department</Label>
                  <Select
                    value={form.watch("departmentId")}
                    onValueChange={(value) => form.setValue("departmentId", value)}
                  >
                    <SelectTrigger data-testid="select-division-department">
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      {(departments as any[]).map((dept) => (
                        <SelectItem key={dept.id} value={dept.id}>
                          {dept.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.formState.errors.departmentId && (
                    <p className="text-sm text-destructive mt-1">
                      {form.formState.errors.departmentId.message}
                    </p>
                  )}
                </div>

                <div className="flex justify-end space-x-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsDialogOpen(false);
                      setEditingDivision(null);
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
                      : editingDivision
                      ? "Update"
                      : "Create"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        }
        data-testid="settings-section-divisions"
      >
        {/* Search and Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search divisions..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search-divisions"
              />
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
              <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-division-department-filter">
                <SelectValue placeholder="Filter by department" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {(departments as any[]).map((dept) => (
                  <SelectItem key={dept.id} value={dept.id}>
                    {dept.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={archiveFilter} onValueChange={setArchiveFilter}>
              <SelectTrigger className="w-full sm:w-[160px]" data-testid="select-division-archive-filter">
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

        {/* Table */}
        {isError ? (
          <div className="text-center py-8">
            <span className="text-destructive">Failed to load divisions.</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/divisions"], exact: false })}
              className="ml-3"
            >
              Retry
            </Button>
          </div>
        ) : isLoading ? (
          <div className="text-center py-8 animate-pulse">Loading divisions...</div>
        ) : filteredDivisions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {(divisions as any[]).length === 0
              ? "No divisions found. Create your first division to get started."
              : "No divisions match your search criteria."}
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHeader
                      label="Name"
                      columnKey="name"
                      direction={sortState.key === "name" ? sortState.direction : null}
                      onSort={toggleSort}
                    />
                    <SortableTableHeader
                      label="Department"
                      columnKey="department"
                      direction={sortState.key === "department" ? sortState.direction : null}
                      onSort={toggleSort}
                    />
                    <SortableTableHeader
                      label="Status"
                      columnKey="status"
                      direction={sortState.key === "status" ? sortState.direction : null}
                      onSort={toggleSort}
                    />
                    <SortableTableHeader
                      label="Created"
                      columnKey="createdAt"
                      direction={sortState.key === "createdAt" ? sortState.direction : null}
                      onSort={toggleSort}
                    />
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayDivisions.map((div) => (
                    <TableRow key={div.id} data-testid={`row-division-${div.id}`}>
                      <TableCell className="font-medium">{div.name}</TableCell>
                      <TableCell>{getDepartmentName(div.departmentId)}</TableCell>
                      <TableCell>
                        <Badge variant={isEntityArchived(div) ? "secondary" : "default"}>
                          {isEntityArchived(div) ? "Archived" : "Active"}
                        </Badge>
                      </TableCell>
                      <TableCell>{new Date(div.createdAt).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditDivision(div)}
                            aria-label={`Edit ${div.name}`}
                            data-testid={`button-edit-division-${div.id}`}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          {isEntityArchived(div) ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setRestoringDivision(div)}
                              aria-label={`Restore ${div.name}`}
                              data-testid={`button-restore-division-${div.id}`}
                            >
                              <RotateCcw className="w-4 h-4" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setArchivingDivision(div)}
                              aria-label={`Archive ${div.name}`}
                              data-testid={`button-archive-division-${div.id}`}
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
            <div className="space-y-3 p-4 md:hidden">
              {displayDivisions.map((div) => (
                <div key={div.id} className="p-4 border rounded-lg" data-testid={`card-division-${div.id}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium break-words">{div.name}</div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">Department</span>
                          <div className="mt-0.5">{getDepartmentName(div.departmentId)}</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Status</span>
                          <div className="mt-0.5">
                            <Badge variant={isEntityArchived(div) ? "secondary" : "default"}>
                              {isEntityArchived(div) ? "Archived" : "Active"}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => handleEditDivision(div)}>
                        Edit
                      </Button>
                      {isEntityArchived(div) ? (
                        <Button variant="ghost" size="sm" onClick={() => setRestoringDivision(div)}>
                          Restore
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => setArchivingDivision(div)}>
                          Archive
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </SettingsSection>

      {/* Archive Confirmation */}
      <ConfirmationDialog
        open={!!archivingDivision}
        onOpenChange={(open) => !open && setArchivingDivision(null)}
        title="Archive Division"
        description={
          <>
            Are you sure you want to archive <strong>{archivingDivision?.name}</strong>?
            This will hide the division from the active list. You can restore it later if needed.
          </>
        }
        confirmText="Archive"
        onConfirm={() => archivingDivision && archiveMutation.mutate(archivingDivision.id)}
        isPending={archiveMutation.isPending}
        variant="destructive"
        data-testid="dialog-archive-division"
      />

      {/* Restore Confirmation */}
      <ConfirmationDialog
        open={!!restoringDivision}
        onOpenChange={(open) => !open && setRestoringDivision(null)}
        title="Restore Division"
        description={
          <>
            Are you sure you want to restore <strong>{restoringDivision?.name}</strong>?
            This will make the division active again.
          </>
        }
        confirmText="Restore"
        onConfirm={() => restoringDivision && restoreMutation.mutate(restoringDivision.id)}
        isPending={restoreMutation.isPending}
        data-testid="dialog-restore-division"
      />
    </>
  );
}

export default DivisionsSection;
