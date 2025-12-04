import { useState, useEffect, useMemo, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Textarea } from "@/shared/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Calendar } from "@/shared/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/shared/components/ui/form";
import { CalendarIcon, Info } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { AutoSelectCombobox } from "@/shared/components/inputs/AutoSelectCombobox";
import { searchDepartments, searchDivisions, searchManagers } from "@/lib/search";
import type { Template, CandidateType, Department, Division, User as UserType, TemplateTask, TaskDefinition, HiringStage } from "@shared/schemas";

const newCandidateSchema = z.object({
  salutation: z.enum(["Mr.", "Ms.", "Mrs.", "Mx.", "Dr.", "Prof.", "Other"]),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address"),
  candidateTypeId: z.string().min(1, "Candidate type is required"),
  departmentId: z.string().min(1, "Department is required"),
  divisionId: z.string().optional(),
  managerId: z.string().optional(),
  facultyRankId: z.string().optional(),
  // NEW: Letter of Intent date is required at creation (immutable after)
  letterOfIntentDate: z.date({
    required_error: "Letter of Intent date is required",
  }),
  // LOO dates are now optional at creation
  offerLetterIssuedAt: z.date().optional(),
  offerLetterAcceptedAt: z.date().optional(),
  // Anticipated start date is now optional at creation
  anticipatedStartDate: z.date().optional(),
  // Template is required but will be applied later when LOO is accepted
  templateId: z.string().min(1, "Template is required"),
}).superRefine((data, ctx) => {
  // Cascading date validation: LOI → LOO Issued → LOO Accepted → Anticipated Start

  // LOO issued must be on or after LOI date
  if (data.offerLetterIssuedAt && data.letterOfIntentDate && data.offerLetterIssuedAt < data.letterOfIntentDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["offerLetterIssuedAt"],
      message: "LOO issued date cannot be before the LOI date",
    });
  }

  // LOO accepted: cascade from LOO Issued if set, otherwise from LOI Date
  if (data.offerLetterAcceptedAt) {
    const minDate = data.offerLetterIssuedAt || data.letterOfIntentDate;
    if (minDate && data.offerLetterAcceptedAt < minDate) {
      const fieldName = data.offerLetterIssuedAt ? "LOO issued" : "LOI";
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["offerLetterAcceptedAt"],
        message: `LOO accepted date cannot be before the ${fieldName} date`,
      });
    }
  }

  // Anticipated start: cascade from LOO Accepted → LOO Issued → LOI Date
  if (data.anticipatedStartDate) {
    const minDate = data.offerLetterAcceptedAt || data.offerLetterIssuedAt || data.letterOfIntentDate;
    if (minDate && data.anticipatedStartDate < minDate) {
      let fieldName = "LOI";
      if (data.offerLetterAcceptedAt) fieldName = "LOO accepted";
      else if (data.offerLetterIssuedAt) fieldName = "LOO issued";
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["anticipatedStartDate"],
        message: `Anticipated start date cannot be before the ${fieldName} date`,
      });
    }
  }
});

type NewCandidateForm = z.infer<typeof newCandidateSchema>;

interface NewCandidateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface DueDate {
  taskName: string;
  dueDate: Date | null;
  priority?: string;
}

export function NewCandidateDialog({ open, onOpenChange }: NewCandidateDialogProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [isCreating, setIsCreating] = useState(false);

  const form = useForm<NewCandidateForm>({
    resolver: zodResolver(newCandidateSchema),
    defaultValues: {
      salutation: "Dr." as const,
      firstName: "",
      lastName: "",
      email: "",
      candidateTypeId: "",
      departmentId: user?.departmentId || "",
      divisionId: user?.divisionId || "",
      managerId: "",
      facultyRankId: "",
      letterOfIntentDate: undefined, // NEW: Required
      offerLetterIssuedAt: undefined, // Now optional
      offerLetterAcceptedAt: undefined,
      anticipatedStartDate: undefined, // Now optional
      templateId: "",
    },
  });

  const selectedDepartmentId = form.watch("departmentId");
  const selectedCandidateTypeId = form.watch("candidateTypeId");
  const selectedTemplateId = form.watch("templateId");
  const selectedAnticipatedStart = form.watch("anticipatedStartDate");
  const selectedLetterOfIntentDate = form.watch("letterOfIntentDate");
  const selectedOfferLetterIssued = form.watch("offerLetterIssuedAt");
  const selectedOfferLetterAccepted = form.watch("offerLetterAcceptedAt");

  // Fetch reference data
  const { data: candidateTypes = [] } = useQuery<CandidateType[]>({
    queryKey: ["/api/candidate-types"],
  });


  const { data: templates = [] } = useQuery<Template[]>({
    queryKey: ["/api/templates"],
  });

  const { data: templateTasks = [] } = useQuery<TemplateTask[]>({
    queryKey: ["/api/templates", selectedTemplateId, "template-tasks"],
    enabled: !!selectedTemplateId,
  });

  const { data: taskDefinitions = [] } = useQuery<TaskDefinition[]>({
    queryKey: ["/api/task-definitions"],
  });

  const { data: hiringStages = [] } = useQuery<HiringStage[]>({
    queryKey: ["/api/hiring-stages"],
  });

  const { data: facultyRanks = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["/api/faculty-ranks"],
    staleTime: 60_000,
  });

  // Filter templates based on selected candidate type (memoized)
  const filteredTemplates = useMemo(
    () => templates.filter((t) => t.isActive && t.candidateTypeId === selectedCandidateTypeId),
    [templates, selectedCandidateTypeId]
  );

  // Check if faculty rank is required for selected candidate type
  const selectedCandidateType = candidateTypes.find(ct => ct.id === selectedCandidateTypeId);
  const isFacultyType = selectedCandidateType && (selectedCandidateType.name === 'Faculty' || selectedCandidateType.name === 'Faculty Clinical');
  const facultyRankRequired = !!isFacultyType;


  // Calculate preview due dates (memoized to prevent infinite re-renders)
  const previewDueDates = useMemo(() => {
    if (!selectedTemplateId || !selectedAnticipatedStart || templateTasks.length === 0) {
      return [];
    }

    const startDate = new Date(selectedAnticipatedStart);
    const looAnchor = selectedOfferLetterAccepted ?? selectedOfferLetterIssued ?? null;
    const calculatedDates: DueDate[] = [];

    templateTasks.forEach((tt) => {
      const taskDef = taskDefinitions.find((td) => td.id === tt.taskDefId);
      if (!taskDef) return;

      let dueDate: Date | null = null;

      switch (tt.dueRuleType) {
        case "on_loo_date":
          dueDate = looAnchor ? new Date(looAnchor) : null;
          break;
        case "days_before_loo":
          if (looAnchor && tt.dueRuleValue) {
            dueDate = new Date(looAnchor);
            dueDate.setDate(dueDate.getDate() - tt.dueRuleValue);
          }
          break;
        case "days_after_loo":
          if (looAnchor && tt.dueRuleValue) {
            dueDate = new Date(looAnchor);
            dueDate.setDate(dueDate.getDate() + tt.dueRuleValue);
          }
          break;
        case "on_start_date":
          dueDate = new Date(startDate);
          break;
        case "days_before_start":
          if (tt.dueRuleValue) {
            dueDate = new Date(startDate);
            dueDate.setDate(dueDate.getDate() - tt.dueRuleValue);
          }
          break;
        case "days_after_start":
          if (tt.dueRuleValue) {
            dueDate = new Date(startDate);
            dueDate.setDate(dueDate.getDate() + tt.dueRuleValue);
          }
          break;
        case "fixed_date":
          if (tt.fixedDate) {
            dueDate = new Date(tt.fixedDate);
          }
          break;
        case "days_before_stage":
        case "days_after_stage":
          dueDate = null;
          break;
        default:
          dueDate = null;
          break;
      }

      calculatedDates.push({
        taskName: taskDef.name,
        dueDate,
      });
    });

    // Sort by due date
    calculatedDates.sort((a, b) => {
      if (!a.dueDate || !b.dueDate) return 0;
      return a.dueDate.getTime() - b.dueDate.getTime();
    });

    return calculatedDates;
  }, [selectedTemplateId, selectedAnticipatedStart, templateTasks, taskDefinitions, selectedOfferLetterIssued, selectedOfferLetterAccepted]);

  // Helper functions to handle dependent field resets
  const handleDepartmentChange = (value: string) => {
    form.setValue("departmentId", value);
    form.setValue("divisionId", undefined);
    form.setValue("managerId", undefined);
  };

  const handleCandidateTypeChange = (value: string) => {
    form.setValue("candidateTypeId", value);
    form.setValue("templateId", "");
  };

  const createCandidateMutation = useMutation({
    mutationFn: async (data: NewCandidateForm) => {
      setIsCreating(true);
      
      // Create candidate with selected template (deferred application)
      // Template will be applied automatically when LOO is accepted
      const candidateData = {
        salutation: data.salutation,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        candidateTypeId: data.candidateTypeId,
        departmentId: data.departmentId,
        divisionId: data.divisionId === "none" ? null : data.divisionId || null,
        managerId: data.managerId === "none" ? null : data.managerId || null,
        facultyRankId: data.facultyRankId || null,
        // NEW: Letter of Intent date is required
        letterOfIntentDate: format(data.letterOfIntentDate, "yyyy-MM-dd"),
        // LOO dates are optional at creation
        offerLetterIssuedAt: data.offerLetterIssuedAt ? format(data.offerLetterIssuedAt, "yyyy-MM-dd") : null,
        offerLetterAcceptedAt: data.offerLetterAcceptedAt ? format(data.offerLetterAcceptedAt, "yyyy-MM-dd") : null,
        // Anticipated start date is optional at creation
        anticipatedStartDate: data.anticipatedStartDate ? format(data.anticipatedStartDate, "yyyy-MM-dd") : null,
        // Template is required - will be stored as selected but not applied until LOO accepted
        templateId: data.templateId,
      };

      const candidateRes = await apiRequest("POST", "/api/candidates", candidateData);
      const candidate = await candidateRes.json();

      if (!candidateRes.ok) {
        throw new Error(candidate.message || "Failed to create candidate");
      }

      // NOTE: Template application is now deferred until LOO is accepted
      // No need to call apply-template separately - it happens automatically
      // when offerLetterAcceptedAt is set via PATCH

      return candidate;
    },
    onSuccess: (candidate) => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/candidates", candidate.id] });
      
      // Determine success message based on whether template was applied
      const hasLOOAccepted = !!candidate.offerLetterAcceptedAt;
      const description = hasLOOAccepted 
        ? "Candidate created and tasks generated"
        : "Candidate created. Tasks will be generated when LOO is accepted.";
      
      toast({
        title: "Success",
        description,
      });

      onOpenChange(false);
      form.reset();
      
      // Navigate to candidate detail page
      setLocation(`/candidates/${candidate.id}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      setIsCreating(false);
    },
  });

  const onSubmit = (data: NewCandidateForm) => {
    createCandidateMutation.mutate(data);
  };

  // Check if user has permission to create candidates
  const canCreateCandidate = user && [
    "system_admin",
    "hr_staff",
    "department_admin",
    "division_leader",
    "manager",
  ].includes(user.role);

  if (!canCreateCandidate) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full sm:max-w-2xl lg:max-w-3xl max-h-[90vh] sm:max-h-min overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Candidate</DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form 
            onSubmit={form.handleSubmit(onSubmit)} 
            className="space-y-4"
            onKeyDown={(e) => {
              // Prevent form submission on Enter key, only allow via submit button
              if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
                e.preventDefault();
              }
            }}
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
              {/* Left Column */}
              <div className="flex flex-col gap-4">
                <FormField
                  control={form.control}
                  name="salutation"
                  render={({ field }: { field: any }) => (
                    <FormItem>
                      <FormLabel>Salutation *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="w-full" data-testid="select-salutation">
                            <SelectValue placeholder="Select salutation" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Mr.">Mr.</SelectItem>
                          <SelectItem value="Ms.">Ms.</SelectItem>
                          <SelectItem value="Mrs.">Mrs.</SelectItem>
                          <SelectItem value="Mx.">Mx.</SelectItem>
                          <SelectItem value="Dr.">Dr.</SelectItem>
                          <SelectItem value="Prof.">Prof.</SelectItem>
                          <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 xs:grid-cols-2 gap-2">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }: { field: any }) => (
                      <FormItem>
                        <FormLabel>First Name *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="John" className="w-full" data-testid="input-first-name" />
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
                        <FormLabel>Last Name *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Doe" className="w-full" data-testid="input-last-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }: { field: any }) => (
                    <FormItem>
                      <FormLabel>Email *</FormLabel>
                      <FormControl>
                        <Input {...field} type="email" placeholder="john.doe@example.com" className="w-full" data-testid="input-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="candidateTypeId"
                  render={({ field }: { field: any }) => (
                    <FormItem>
                      <FormLabel>Candidate Type *</FormLabel>
                      <Select onValueChange={handleCandidateTypeChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger className="w-full" data-testid="select-candidate-type">
                            <SelectValue placeholder="Select candidate type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {candidateTypes.map((type) => (
                            <SelectItem key={type.id} value={type.id}>
                              {type.name}
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
                  name="departmentId"
                  render={({ field }: { field: any }) => (
                    <FormItem>
                      <FormControl>
                        <AutoSelectCombobox
                          label="Department"
                          value={field.value}
                          onChange={(id) => {
                            if (id) handleDepartmentChange(id);
                          }}
                          fetchItems={searchDepartments}
                          emptyText="No departments available."
                          placeholder="Search departments..."
                          required
                          data-testid="select-department"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="divisionId"
                  render={({ field }: { field: any }) => (
                    <FormItem>
                      <FormControl>
                        <AutoSelectCombobox
                          label="Division"
                          value={field.value || ""}
                          onChange={(id) => {
                            form.setValue("managerId", undefined);
                            field.onChange(id || undefined);
                          }}
                          fetchItems={(q) => searchDivisions(q, selectedDepartmentId)}
                          emptyText="No divisions available."
                          placeholder="Search divisions..."
                          disabled={!selectedDepartmentId}
                          data-testid="select-division"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="managerId"
                  render={({ field }: { field: any }) => (
                    <FormItem>
                      <FormControl>
                        <AutoSelectCombobox
                          label="Manager"
                          value={field.value || ""}
                          onChange={field.onChange}
                          fetchItems={(q) => searchManagers(q, selectedDepartmentId, form.watch('divisionId') || undefined)}
                          emptyText="No managers available."
                          placeholder="Search managers..."
                          disabled={!selectedDepartmentId}
                          onError={(e) => toast({ 
                            title: 'Error loading managers', 
                            description: e.message, 
                            variant: 'destructive' 
                          })}
                          data-testid="select-manager"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

              </div>

              {/* Right Column */}
              <div className="flex flex-col gap-4">
                {/* NEW: Letter of Intent Date - required at creation */}
                <FormField
                  control={form.control}
                  name="letterOfIntentDate"
                  render={({ field }: { field: any }) => {
                    const [isCalendarOpen, setIsCalendarOpen] = useState(false);

                    return (
                      <FormItem>
                        <FormLabel>Letter of Intent Date *</FormLabel>
                        <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                                data-testid="button-loi-date"
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
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />

                <FormField
                  control={form.control}
                  name="offerLetterIssuedAt"
                  render={({ field }: { field: any }) => {
                    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
                    const loiDate = selectedLetterOfIntentDate ? new Date(selectedLetterOfIntentDate) : null;
                    if (loiDate) {
                      loiDate.setHours(0, 0, 0, 0);
                    }

                    return (
                      <FormItem>
                        <FormLabel>LOO Issued Date (Optional)</FormLabel>
                        <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                                data-testid="button-loo-issued-date"
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
                                // LOO issued must be on or after LOI date
                                if (loiDate && date < loiDate) {
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
                                    field.onChange(undefined);
                                    // Also clear LOO accepted since it depends on LOO issued
                                    form.setValue("offerLetterAcceptedAt", undefined);
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
                    // Cascade: LOO Accepted >= LOO Issued >= LOI Date
                    const loiDate = selectedLetterOfIntentDate ? new Date(selectedLetterOfIntentDate) : null;
                    const issuedDate = selectedOfferLetterIssued ? new Date(selectedOfferLetterIssued) : null;
                    if (loiDate) loiDate.setHours(0, 0, 0, 0);
                    if (issuedDate) issuedDate.setHours(0, 0, 0, 0);
                    // Use LOO Issued if set, otherwise fall back to LOI Date
                    const minDate = issuedDate || loiDate;

                    return (
                      <FormItem>
                        <FormLabel>LOO Accepted Date (Optional)</FormLabel>
                        <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                                data-testid="button-loo-accepted-date"
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
                                // Must be on or after the previous date in the cascade
                                if (minDate && date < minDate) {
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
                                    field.onChange(undefined);
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
                    // Cascade: Anticipated Start >= LOO Accepted >= LOO Issued >= LOI Date
                    const loiDate = selectedLetterOfIntentDate ? new Date(selectedLetterOfIntentDate) : null;
                    const issuedDate = selectedOfferLetterIssued ? new Date(selectedOfferLetterIssued) : null;
                    const acceptedDate = selectedOfferLetterAccepted ? new Date(selectedOfferLetterAccepted) : null;
                    if (loiDate) loiDate.setHours(0, 0, 0, 0);
                    if (issuedDate) issuedDate.setHours(0, 0, 0, 0);
                    if (acceptedDate) acceptedDate.setHours(0, 0, 0, 0);
                    // Use the latest date in the cascade that's set
                    const minDate = acceptedDate || issuedDate || loiDate;
                    
                    return (
                      <FormItem>
                        <FormLabel>Anticipated Start Date (Optional)</FormLabel>
                        <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                                data-testid="button-anticipated-start-date"
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
                                // Must be on or after the previous date in the cascade
                                if (minDate && date < minDate) {
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
                                    field.onChange(undefined);
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
                  name="templateId"
                  render={({ field }: { field: any }) => (
                    <FormItem>
                      <FormLabel>Template *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        disabled={!selectedCandidateTypeId}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full" data-testid="select-template">
                            <SelectValue placeholder="Select template" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {filteredTemplates.length === 0 ? (
                            <div className="px-2 py-1.5 text-sm text-muted-foreground">
                              No templates available for selected type
                            </div>
                          ) : (
                            filteredTemplates.map((template) => (
                              <SelectItem key={template.id} value={template.id}>
                                {template.name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                      {/* Info about deferred template application */}
                      {selectedTemplateId && !selectedOfferLetterAccepted && (
                        <div className="flex items-start gap-2 p-2 text-xs text-muted-foreground bg-muted/50 rounded-md mt-2">
                          <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                          <span>
                            Tasks will be generated when the Letter of Offer is accepted.
                          </span>
                        </div>
                      )}
                    </FormItem>
                  )}
                />

                {/* Faculty Rank - only show for Faculty types */}
                {isFacultyType && (
                  <FormField
                    control={form.control}
                    name="facultyRankId"
                    render={({ field }: { field: any }) => (
                      <FormItem>
                        <FormLabel>Faculty Rank {facultyRankRequired && "*"}</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full" data-testid="select-faculty-rank">
                              <SelectValue placeholder="Select faculty rank" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {facultyRanks.map((rank) => (
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

                {/* Preview Due Dates Panel */}
                {previewDueDates.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Info className="w-4 h-4" />
                        Preview Due Dates
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 max-h-[200px] overflow-y-auto">
                        {previewDueDates.slice(0, 5).map((item, index) => (
                          <div
                            key={index}
                            className="flex justify-between items-center text-sm"
                          >
                            <span className="text-muted-foreground truncate flex-1 pr-2">
                              {item.taskName}
                            </span>
                            <Badge variant="outline">
                              {item.dueDate
                                ? format(item.dueDate, "MMM d, yyyy")
                                : "No due date"}
                            </Badge>
                          </div>
                        ))}
                        {previewDueDates.length > 5 && (
                          <div className="text-sm text-muted-foreground text-center pt-1">
                            +{previewDueDates.length - 5} more tasks...
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isCreating}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isCreating || !form.formState.isValid}
                data-testid="button-create-candidate"
              >
                {isCreating ? "Creating..." : "Create Candidate"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
