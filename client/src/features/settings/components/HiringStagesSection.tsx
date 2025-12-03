/**
 * HiringStagesSection - Manage hiring workflow stages
 * System-level setting for configuring the hiring pipeline
 */
import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Target, Plus, Edit, Trash2 } from "lucide-react";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/shared/hooks/use-toast";
import { insertHiringStageSchema } from "@shared/schemas";
import { useSortableTable } from "@/shared/hooks/use-sortable-table";
import { SortableTableHeader } from "@/shared/components/sortable-table-header";

// UI Components
import { SettingsSection } from "@/shared/components/settings/SettingsSection";
import { ConfirmationDialog } from "@/shared/components/settings/ConfirmationDialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Badge } from "@/shared/components/ui/badge";
import { Switch } from "@/shared/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/shared/components/ui/dialog";

// Schema
const hiringStageSchema = insertHiringStageSchema.pick({
  name: true,
  description: true,
  orderIndex: true,
  isActive: true,
});
type HiringStageForm = z.infer<typeof hiringStageSchema>;

type HiringStageSortKey = "name" | "orderIndex" | "status";

export function HiringStagesSection() {
  const { user } = useAuth();
  const { toast } = useToast();

  // State
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStage, setEditingStage] = useState<any>(null);
  const [deletingStage, setDeletingStage] = useState<any>(null);

  // Form
  const form = useForm<HiringStageForm>({
    resolver: zodResolver(hiringStageSchema),
    defaultValues: { name: "", description: "", orderIndex: 0, isActive: true },
  });

  // Query
  const { data: hiringStages = [], isLoading } = useQuery({
    queryKey: ["/api/hiring-stages", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/hiring-stages");
      return res.json();
    },
  });

  // Sortable columns configuration
  const sortableColumns = useMemo(() => ({
    name: { key: "name" as const, getValue: (stage: any) => stage.name?.toLowerCase() || "" },
    orderIndex: { key: "orderIndex" as const, getValue: (stage: any) => stage.orderIndex },
    status: { key: "status" as const, getValue: (stage: any) => (stage.isActive ? "active" : "inactive") },
  }), []);

  const { sortedRows: displayStages, sortState, toggleSort } = useSortableTable<any, HiringStageSortKey>({
    rows: hiringStages as any[],
    columns: sortableColumns,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: async (data: HiringStageForm) => {
      const res = await apiRequest("POST", "/api/hiring-stages", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hiring-stages"] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: "Stage created", description: "The hiring stage was created successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<HiringStageForm> }) => {
      const res = await apiRequest("PATCH", `/api/hiring-stages/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hiring-stages"] });
      setIsDialogOpen(false);
      setEditingStage(null);
      form.reset();
      toast({ title: "Stage updated", description: "The hiring stage was updated successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/hiring-stages/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hiring-stages"] });
      setDeletingStage(null);
      toast({ title: "Stage deleted", description: "The hiring stage was deleted successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Handlers
  const handleNewStage = () => {
    setEditingStage(null);
    form.reset({ name: "", description: "", orderIndex: 0, isActive: true });
    setIsDialogOpen(true);
  };

  const handleEditStage = (stage: any) => {
    setEditingStage(stage);
    form.reset({
      name: stage.name,
      description: stage.description || "",
      orderIndex: stage.orderIndex,
      isActive: stage.isActive,
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (data: HiringStageForm) => {
    if (editingStage) {
      updateMutation.mutate({ id: editingStage.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <>
      <SettingsSection
        title="Hiring Stages"
        description="Configure the stages in your hiring workflow. Candidates progress through these stages during onboarding."
        icon={Target}
        actions={
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={handleNewStage} data-testid="button-new-hiring-stage">
                <Plus className="w-4 h-4 mr-2" />
                New Stage
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{editingStage ? "Edit Hiring Stage" : "Create Hiring Stage"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <div>
                  <Label htmlFor="stage-name">Stage Name</Label>
                  <Input
                    id="stage-name"
                    placeholder="e.g., Initial Review, Background Check"
                    {...form.register("name")}
                    data-testid="input-stage-name"
                  />
                  {form.formState.errors.name && (
                    <p className="text-sm text-destructive mt-1">{form.formState.errors.name.message}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="stage-description">Description (Optional)</Label>
                  <Input
                    id="stage-description"
                    placeholder="Brief description of this stage"
                    {...form.register("description")}
                    data-testid="input-stage-description"
                  />
                </div>

                <div>
                  <Label htmlFor="stage-order">Order Index</Label>
                  <Input
                    id="stage-order"
                    type="number"
                    min="0"
                    {...form.register("orderIndex", { valueAsNumber: true })}
                    data-testid="input-stage-order"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Lower numbers appear first in the pipeline
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="stage-active"
                    checked={form.watch("isActive")}
                    onCheckedChange={(checked) => form.setValue("isActive", checked)}
                    data-testid="switch-stage-active"
                  />
                  <Label htmlFor="stage-active">Active</Label>
                </div>

                <div className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                    {createMutation.isPending || updateMutation.isPending ? "Saving..." : editingStage ? "Update" : "Create"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        }
        data-testid="settings-section-hiring-stages"
      >
        {isLoading ? (
          <div className="text-center py-8 animate-pulse">Loading hiring stages...</div>
        ) : (hiringStages as any[]).length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No hiring stages configured. Create your first stage to define your hiring workflow.
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
                      sortKey="name"
                      sortState={sortState}
                      onToggleSort={toggleSort}
                    />
                    <TableHead>Description</TableHead>
                    <SortableTableHeader
                      label="Order"
                      sortKey="orderIndex"
                      sortState={sortState}
                      onToggleSort={toggleSort}
                    />
                    <SortableTableHeader
                      label="Status"
                      sortKey="status"
                      sortState={sortState}
                      onToggleSort={toggleSort}
                    />
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayStages.map((stage) => (
                    <TableRow key={stage.id} data-testid={`row-hiring-stage-${stage.id}`}>
                      <TableCell className="font-medium">{stage.name}</TableCell>
                      <TableCell className="text-muted-foreground">{stage.description || "—"}</TableCell>
                      <TableCell>{stage.orderIndex}</TableCell>
                      <TableCell>
                        <Badge variant={stage.isActive ? "default" : "secondary"}>
                          {stage.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Button variant="ghost" size="sm" onClick={() => handleEditStage(stage)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() => setDeletingStage(stage)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Cards */}
            <div className="space-y-3 md:hidden">
              {displayStages.map((stage) => (
                <div key={stage.id} className="p-4 border rounded-lg">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{stage.name}</div>
                      <div className="text-xs text-muted-foreground">{stage.description || "—"}</div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs text-muted-foreground">Order: {stage.orderIndex}</span>
                        <Badge variant={stage.isActive ? "default" : "secondary"} className="text-xs">
                          {stage.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => handleEditStage(stage)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => setDeletingStage(stage)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </SettingsSection>

      {/* Delete Confirmation */}
      <ConfirmationDialog
        open={!!deletingStage}
        onOpenChange={(open) => !open && setDeletingStage(null)}
        title="Delete Hiring Stage"
        description={
          <>
            Are you sure you want to delete <strong>{deletingStage?.name}</strong>?
            This action cannot be undone. Candidates in this stage may be affected.
          </>
        }
        confirmText="Delete"
        onConfirm={() => deletingStage && deleteMutation.mutate(deletingStage.id)}
        isPending={deleteMutation.isPending}
        variant="destructive"
        data-testid="dialog-delete-hiring-stage"
      />
    </>
  );
}

export default HiringStagesSection;
