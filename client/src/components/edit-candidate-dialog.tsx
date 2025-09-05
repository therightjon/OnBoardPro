import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

// Validation schema for editable fields only
const editCandidateSchema = z.object({
  salutation: z.enum(["Mr.", "Ms.", "Mrs.", "Dr.", "Prof.", "Mx.", "Other"]),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Please enter a valid email address"),
  departmentId: z.string().min(1, "Department is required"),
  divisionId: z.string().optional(),
  managerId: z.string().optional(),
  facultyRankId: z.string().optional(),
});

type EditCandidateFormData = z.infer<typeof editCandidateSchema>;

interface EditCandidateDialogProps {
  candidate: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditCandidateDialog({ candidate, open, onOpenChange }: EditCandidateDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(candidate?.departmentId || "");

  const form = useForm<EditCandidateFormData>({
    resolver: zodResolver(editCandidateSchema),
    defaultValues: {
      salutation: candidate?.salutation || "Mr.",
      firstName: candidate?.firstName || "",
      lastName: candidate?.lastName || "",
      email: candidate?.email || "",
      departmentId: candidate?.departmentId || "",
      divisionId: candidate?.divisionId || "",
      managerId: candidate?.managerId || "",
      facultyRankId: candidate?.facultyRankId || "",
    },
  });

  // Load departments
  const { data: departments = [] } = useQuery({
    queryKey: ["/api/departments"],
  });

  // Load divisions filtered by selected department
  const { data: divisions = [] } = useQuery({
    queryKey: ["/api/divisions"],
    select: (data: any[]) => 
      selectedDepartmentId 
        ? data.filter((div: any) => div.departmentId === selectedDepartmentId)
        : data,
  });

  // Load managers filtered by department and division
  const { data: managers = [] } = useQuery({
    queryKey: ["/api/users/managers", { departmentId: selectedDepartmentId, divisionId: form.watch('divisionId') }],
    queryFn: async () => {
      if (!selectedDepartmentId) return [];
      const params = new URLSearchParams({
        departmentId: selectedDepartmentId,
        ...(form.watch('divisionId') && form.watch('divisionId') !== 'none' && { divisionId: form.watch('divisionId') }),
        limit: '20'
      });
      const response = await fetch(`/api/users/managers?${params}`);
      if (!response.ok) throw new Error('Failed to fetch managers');
      return response.json();
    },
    enabled: !!selectedDepartmentId,
  });

  // Load faculty ranks
  const { data: facultyRanks = [] } = useQuery({
    queryKey: ["/api/faculty-ranks"],
  });

  const updateMutation = useMutation({
    mutationFn: async (data: EditCandidateFormData) => {
      const response = await apiRequest("PATCH", `/api/candidates/${candidate.id}`, data);
      return response.json();
    },
    onSuccess: (updatedCandidate) => {
      toast({
        title: "Success",
        description: "Candidate updated successfully",
      });
      
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidate.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
      
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update candidate",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: EditCandidateFormData) => {
    updateMutation.mutate(data);
  };

  // Update divisions when department changes
  const handleDepartmentChange = (departmentId: string) => {
    setSelectedDepartmentId(departmentId);
    form.setValue("divisionId", ""); // Clear division selection
    form.setValue("managerId", ""); // Clear manager selection
  };

  // Prevent Enter key from submitting form when in select components
  const handleSelectKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
    }
  };

  const isFaculty = candidate?.candidateType?.name === 'Faculty' || candidate?.candidateType?.name === 'Faculty Clinical';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-full sm:max-w-[600px] lg:max-w-2xl sm:max-h-[65vh] overflow-y-auto" data-testid="dialog-edit-candidate">
        <DialogHeader>
          <DialogTitle>Edit Candidate</DialogTitle>
          <DialogDescription>
            Update the candidate's contact and organizational information. Template, candidate type, and start date cannot be modified.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Personal Information */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">Personal Information</h3>
                
                <FormField
                  control={form.control}
                  name="salutation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Salutation</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-salutation">
                            <SelectValue placeholder="Select salutation" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Mr.">Mr.</SelectItem>
                          <SelectItem value="Ms.">Ms.</SelectItem>
                          <SelectItem value="Mrs.">Mrs.</SelectItem>
                          <SelectItem value="Dr.">Dr.</SelectItem>
                          <SelectItem value="Prof.">Prof.</SelectItem>
                          <SelectItem value="Mx.">Mx.</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-first-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-last-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" {...field} data-testid="input-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Organizational Information */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-muted-foreground">Organization</h3>
                
                <FormField
                  control={form.control}
                  name="departmentId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Department</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          field.onChange(value);
                          handleDepartmentChange(value);
                        }}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger 
                            data-testid="select-department"
                            onKeyDown={handleSelectKeyDown}
                          >
                            <SelectValue placeholder="Select department" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {departments.map((dept: any) => (
                            <SelectItem key={dept.id} value={dept.id}>
                              {dept.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="divisionId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Division (Optional)</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger 
                            data-testid="select-division"
                            onKeyDown={handleSelectKeyDown}
                          >
                            <SelectValue placeholder="Select division" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {divisions.map((div: any) => (
                            <SelectItem key={div.id} value={div.id}>
                              {div.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="managerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Manager (Optional)</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger 
                            data-testid="select-manager"
                            onKeyDown={handleSelectKeyDown}
                          >
                            <SelectValue placeholder="Select manager" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {managers.map((manager: any) => (
                            <SelectItem key={manager.id} value={manager.id}>
                              {manager.firstName} {manager.lastName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {isFaculty && (
                  <FormField
                    control={form.control}
                    name="facultyRankId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Faculty Rank</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-faculty-rank">
                              <SelectValue placeholder="Select faculty rank" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {facultyRanks.map((rank: any) => (
                              <SelectItem key={rank.id} value={rank.id}>
                                {rank.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
            </div>

            {/* Read-only Information */}
            <div className="border-t pt-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Read-Only Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="font-medium">Candidate Type:</span>
                  <p className="text-muted-foreground">{candidate?.candidateType?.name || "Not set"}</p>
                </div>
                <div>
                  <span className="font-medium">Start Date:</span>
                  <p className="text-muted-foreground">
                    {candidate?.startDate ? new Date(candidate.startDate).toLocaleDateString() : "Not set"}
                  </p>
                </div>
                <div>
                  <span className="font-medium">Template:</span>
                  <p className="text-muted-foreground">{candidate?.templateNameSnapshot || "None applied"}</p>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-edit"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateMutation.isPending}
                data-testid="button-save-changes"
              >
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}