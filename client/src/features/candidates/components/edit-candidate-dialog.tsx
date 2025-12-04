import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { insertCandidateSchema } from "@shared/schemas";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/shared/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/shared/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Calendar } from "@/shared/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { useToast } from "@/shared/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

// Validation schema for editable fields including employment dates
const editCandidateSchema = insertCandidateSchema.pick({
  salutation: true,
  firstName: true,
  lastName: true,
  email: true,
  departmentId: true,
  divisionId: true,
  managerId: true,
  facultyRankId: true,
}).extend({
  offerLetterIssuedAt: z.date().optional().nullable(),
  offerLetterAcceptedAt: z.date().optional().nullable(),
  anticipatedStartDate: z.date().optional().nullable(),
}).superRefine((data, ctx) => {
  // LOO accepted must be on or after LOO issued
  if (data.offerLetterAcceptedAt && data.offerLetterIssuedAt && data.offerLetterAcceptedAt < data.offerLetterIssuedAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["offerLetterAcceptedAt"],
      message: "LOO accepted date cannot be before the issued date",
    });
  }
  // Anticipated start must be on or after LOO issued
  if (data.anticipatedStartDate && data.offerLetterIssuedAt && data.anticipatedStartDate < data.offerLetterIssuedAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["anticipatedStartDate"],
      message: "Anticipated start date cannot be before the LOO issued date",
    });
  }
  // Anticipated start must be on or after LOO accepted (if set)
  if (data.anticipatedStartDate && data.offerLetterAcceptedAt && data.anticipatedStartDate < data.offerLetterAcceptedAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["anticipatedStartDate"],
      message: "Anticipated start date cannot be before the LOO accepted date",
    });
  }
});

type EditCandidateFormData = z.infer<typeof editCandidateSchema>;

interface EditCandidateDialogProps {
  candidate: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Helper to parse ISO date string to Date object
// For date-only strings (YYYY-MM-DD), parse as local midnight to avoid timezone offset display issues
const parseDate = (dateStr: string | null | undefined): Date | undefined => {
  if (!dateStr) return undefined;
  // Check if it's a date-only string (YYYY-MM-DD)
  const dateOnlyRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (dateOnlyRegex.test(dateStr)) {
    // Parse as local date (year, month-1, day) to avoid UTC offset issues
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  // For full ISO strings, parse normally
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? undefined : date;
};

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
      divisionId: candidate?.divisionId ?? undefined,
      managerId: candidate?.managerId ?? undefined,
      facultyRankId: candidate?.facultyRankId ?? undefined,
      offerLetterIssuedAt: parseDate(candidate?.offerLetterIssuedAt),
      offerLetterAcceptedAt: parseDate(candidate?.offerLetterAcceptedAt),
      anticipatedStartDate: parseDate(candidate?.anticipatedStartDate),
    },
  });

  // Watch date fields for cross-field validation display
  const selectedOfferLetterIssued = form.watch("offerLetterIssuedAt");
  const selectedOfferLetterAccepted = form.watch("offerLetterAcceptedAt");

  // Load departments
  const { data: departments = [] } = useQuery({
    queryKey: ["/api/departments"],
  });

  // Load divisions filtered by selected department (server-side filtering)
  const { data: divisions = [] } = useQuery({
    queryKey: ["/api/divisions", { departmentId: selectedDepartmentId }],
    queryFn: async () => {
      if (!selectedDepartmentId) return [];
      const params = new URLSearchParams({ departmentId: selectedDepartmentId, limit: '50' });
      const response = await fetch(`/api/divisions?${params}`);
      if (!response.ok) throw new Error('Failed to fetch divisions');
      return response.json();
    },
    enabled: !!selectedDepartmentId,
  });

  // Load managers filtered by department and division
  const { data: managers = [] } = useQuery({
    queryKey: ["/api/users/managers", { departmentId: selectedDepartmentId, divisionId: form.watch('divisionId') }],
    queryFn: async () => {
      if (!selectedDepartmentId) return [];
      const params = new URLSearchParams();
      params.set('departmentId', selectedDepartmentId);
      const divisionId = form.watch('divisionId');
      if (divisionId && divisionId !== 'none') {
        params.set('divisionId', divisionId);
      }
      params.set('limit', '20');
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
    mutationFn: async (data: Record<string, unknown>) => {
      const response = await apiRequest("PATCH", `/api/candidates/${candidate.id}`, data);
      return response.json();
    },
    onSuccess: (updatedCandidate) => {
      toast({
        title: "Success",
        description: "Candidate updated successfully",
      });
      
      // Invalidate related queries (including tasks since due dates may have changed)
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidate.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidate.id, "tasks"] });
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
    const payload = {
      ...data,
      divisionId: data.divisionId || undefined,
      managerId: data.managerId || undefined,
      facultyRankId: data.facultyRankId || undefined,
      // Format dates as ISO strings for the API
      offerLetterIssuedAt: data.offerLetterIssuedAt ? format(data.offerLetterIssuedAt, "yyyy-MM-dd") : null,
      offerLetterAcceptedAt: data.offerLetterAcceptedAt ? format(data.offerLetterAcceptedAt, "yyyy-MM-dd") : null,
      anticipatedStartDate: data.anticipatedStartDate ? format(data.anticipatedStartDate, "yyyy-MM-dd") : null,
    };
    updateMutation.mutate(payload);
  };

  // Update divisions when department changes
  const handleDepartmentChange = (departmentId: string) => {
    setSelectedDepartmentId(departmentId);
    form.setValue("divisionId", undefined); // Clear division selection
    form.setValue("managerId", undefined); // Clear manager selection
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
      <DialogContent className="max-w-[95vw] w-full sm:max-w-[600px] lg:max-w-2xl max-h-[90vh] sm:max-h-min overflow-y-auto" data-testid="dialog-edit-candidate">
        <DialogHeader>
          <DialogTitle>Edit Candidate</DialogTitle>
          <DialogDescription>
            Update the candidate's contact, organizational, and employment information. Template and candidate type cannot be modified.
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
                  render={({ field }: { field: any }) => (
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
                  render={({ field }: { field: any }) => (
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
                  render={({ field }: { field: any }) => (
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
                  render={({ field }: { field: any }) => (
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
                  render={({ field }: { field: any }) => (
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
                          {(departments as any[]).map((dept: any) => (
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
                  render={({ field }: { field: any }) => (
                    <FormItem>
                      <FormLabel>Division (Optional)</FormLabel>
                      <Select 
                        onValueChange={(value) => {
                          field.onChange(value);
                          // Clear manager selection when division changes
                          form.setValue("managerId", undefined);
                        }} 
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger 
                            data-testid="select-division"
                            onKeyDown={handleSelectKeyDown}
                          >
                            <SelectValue placeholder="Select division" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {divisions.length === 0 ? (
                            <SelectItem disabled value="__no_divisions__">
                              No divisions available.
                            </SelectItem>
                          ) : (
                            divisions.map((div: any) => (
                              <SelectItem key={div.id} value={div.id}>
                                {div.name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="managerId"
                  render={({ field }: { field: any }) => (
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
                          {managers.length === 0 ? (
                            // Disabled placeholder item when no managers available
                            <SelectItem disabled value="__no_managers__">
                              No managers available.
                            </SelectItem>
                          ) : (
                            managers.map((manager: any) => (
                              <SelectItem key={manager.id} value={manager.id}>
                                {manager.name ?? `${manager.firstName ?? ''} ${manager.lastName ?? ''}`.trim()}
                              </SelectItem>
                            ))
                          )}
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
                    render={({ field }: { field: any }) => (
                      <FormItem>
                        <FormLabel>Faculty Rank</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-faculty-rank">
                              <SelectValue placeholder="Select faculty rank" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {(facultyRanks as any[]).map((rank: any) => (
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

            {/* Employment Dates */}
            <div className="border-t pt-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Employment Dates</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Changing these dates will automatically recalculate task due dates based on their anchoring rules.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="offerLetterIssuedAt"
                  render={({ field }: { field: any }) => {
                    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
                    return (
                      <FormItem>
                        <FormLabel>LOO Issued Date</FormLabel>
                        <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                                data-testid="button-edit-loo-issued-date"
                              >
                                {field.value ? (
                                  format(field.value, "PPP")
                                ) : (
                                  <span>Pick a date</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={(date) => {
                                field.onChange(date);
                                setIsCalendarOpen(false);
                              }}
                              initialFocus
                            />
                            {field.value && (
                              <div className="flex justify-end p-3 pt-0">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    field.onChange(null);
                                    setIsCalendarOpen(false);
                                  }}
                                >
                                  Clear
                                </Button>
                              </div>
                            )}
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />

                <FormField
                  control={form.control}
                  name="offerLetterAcceptedAt"
                  render={({ field }: { field: any }) => {
                    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
                    const issuedDate = selectedOfferLetterIssued ? new Date(selectedOfferLetterIssued) : null;
                    if (issuedDate) {
                      issuedDate.setHours(0, 0, 0, 0);
                    }
                    return (
                      <FormItem>
                        <FormLabel>LOO Accepted Date</FormLabel>
                        <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                                data-testid="button-edit-loo-accepted-date"
                              >
                                {field.value ? (
                                  format(field.value, "PPP")
                                ) : (
                                  <span>Pick a date</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={(date) => {
                                field.onChange(date);
                                setIsCalendarOpen(false);
                              }}
                              disabled={(date) => {
                                // Cannot be before LOO issued date
                                if (issuedDate && date < issuedDate) {
                                  return true;
                                }
                                return false;
                              }}
                              initialFocus
                            />
                            {field.value && (
                              <div className="flex justify-end p-3 pt-0">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    field.onChange(null);
                                    setIsCalendarOpen(false);
                                  }}
                                >
                                  Clear
                                </Button>
                              </div>
                            )}
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />

                <FormField
                  control={form.control}
                  name="anticipatedStartDate"
                  render={({ field }: { field: any }) => {
                    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
                    const issuedDate = selectedOfferLetterIssued ? new Date(selectedOfferLetterIssued) : null;
                    const acceptedDate = selectedOfferLetterAccepted ? new Date(selectedOfferLetterAccepted) : null;
                    if (issuedDate) {
                      issuedDate.setHours(0, 0, 0, 0);
                    }
                    if (acceptedDate) {
                      acceptedDate.setHours(0, 0, 0, 0);
                    }
                    return (
                      <FormItem>
                        <FormLabel>Anticipated Start Date</FormLabel>
                        <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                                data-testid="button-edit-anticipated-start-date"
                              >
                                {field.value ? (
                                  format(field.value, "PPP")
                                ) : (
                                  <span>Pick a date</span>
                                )}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={(date) => {
                                field.onChange(date);
                                setIsCalendarOpen(false);
                              }}
                              disabled={(date) => {
                                // Cannot be before LOO issued date
                                if (issuedDate && date < issuedDate) {
                                  return true;
                                }
                                // Cannot be before LOO accepted date (if set)
                                if (acceptedDate && date < acceptedDate) {
                                  return true;
                                }
                                return false;
                              }}
                              initialFocus
                            />
                            {field.value && (
                              <div className="flex justify-end p-3 pt-0">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    field.onChange(null);
                                    setIsCalendarOpen(false);
                                  }}
                                >
                                  Clear
                                </Button>
                              </div>
                            )}
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
              </div>
            </div>

            {/* Read-only Information */}
            <div className="border-t pt-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Read-Only Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Candidate Type:</span>
                  <p className="text-muted-foreground">{candidate?.candidateType?.name || "Not set"}</p>
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
