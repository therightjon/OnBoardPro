import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Badge } from "@/shared/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/shared/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/shared/components/ui/alert-dialog";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { Plus, Search, Filter, Edit, Eye, Settings, ClipboardList, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/shared/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { RouteGuard } from "@/shared/components/route-guard";
import { useAuth } from "@/features/auth/hooks/use-auth.tsx";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/shared/components/ui/form";
import { Textarea } from "@/shared/components/ui/textarea";
import { Checkbox } from "@/shared/components/ui/checkbox";
import type { Template, CandidateType } from "@shared/schemas";

const templateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  candidateTypeId: z.string().min(1, "Candidate type is required"),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
  cloneFromTemplateId: z.string().optional(),
});

type TemplateForm = z.infer<typeof templateSchema>;

export default function TemplatesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: templates = [], isLoading } = useQuery<Template[]>({
    queryKey: ["/api/templates"],
  });

  const { data: candidateTypes = [] } = useQuery<CandidateType[]>({
    queryKey: ["/api/candidate-types"],
  });

  const form = useForm<TemplateForm>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      name: "",
      candidateTypeId: "",
      description: "",
      isActive: false,
      cloneFromTemplateId: "none",
    },
  });

  const createTemplateMutation = useMutation({
    mutationFn: async (data: TemplateForm) => {
      const res = await apiRequest("POST", "/api/templates", data);
      return res.json();
    },
    onSuccess: (template) => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      setIsCreateDialogOpen(false);
      form.reset();
      toast({
        title: "Success",
        description: "Template created successfully",
      });
      // Navigate to the template detail page
      window.location.href = `/templates/${template.id}`;
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const res = await apiRequest("DELETE", `/api/templates/${templateId}`);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      toast({
        title: "Success",
        description: "Template archived successfully",
      });
      setDeleteTemplateId(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to archive template",
        variant: "destructive",
      });
    },
  });

  const filteredTemplates = templates.filter((template: any) => {
    const matchesSearch = template.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === "all" || template.candidateTypeId === typeFilter;
    
    return matchesSearch && matchesType;
  });

  const getCandidateTypeName = (candidateTypeId: string) => {
    const type = candidateTypes.find((t: any) => t.id === candidateTypeId);
    return type?.name || "Unknown";
  };

  const onSubmit = (data: TemplateForm) => {
    // Convert "none" values back to null/empty for the API
    const processedData = {
      ...data,
      cloneFromTemplateId: data.cloneFromTemplateId === "none" ? "" : data.cloneFromTemplateId,
    };
    createTemplateMutation.mutate(processedData);
  };

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-4 xs:space-y-5 sm:space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 xs:h-8 bg-muted rounded w-1/4"></div>
          <div className="h-24 xs:h-32 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <RouteGuard allowedRoles={["system_admin", "hr_staff"]}>
      <div className="p-4 sm:p-6 space-y-4 xs:space-y-5 sm:space-y-6">
      {/* Page Header */}
      <div className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-3 xs:gap-4">
        <div className="min-w-0">
          <h1 className="text-lg xs:text-xl sm:text-2xl font-bold text-foreground" data-testid="text-templates-title">Templates</h1>
          <p className="text-sm sm:text-base text-muted-foreground">Manage onboarding templates and workflows</p>
        </div>
        <div className="flex items-center space-x-3">
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-new-template">
                <Plus className="w-4 h-4 mr-2" />
                New Template
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[95vw] w-full sm:max-w-2xl max-h-[90vh] sm:max-h-min overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create New Template</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }: { field: any }) => (
                      <FormItem>
                        <FormLabel>Template Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Enter template name"
                            {...field}
                            data-testid="input-template-name"
                          />
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
                        <FormLabel>Candidate Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-candidate-type">
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
                    name="description"
                    render={({ field }: { field: any }) => (
                      <FormItem>
                        <FormLabel>Description (Optional)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Enter template description"
                            {...field}
                            data-testid="textarea-template-description"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="cloneFromTemplateId"
                    render={({ field }: { field: any }) => (
                      <FormItem>
                        <FormLabel>Clone From (Optional)</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-clone-template">
                              <SelectValue placeholder="Select template to clone from" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">None - Create blank template</SelectItem>
                            {templates
                              .filter(t => t.isActive && !t.archived)
                              .map((template) => (
                              <SelectItem key={template.id} value={template.id}>
                                {template.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />


                  <div className="flex justify-end space-x-2">
                    <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createTemplateMutation.isPending}>
                      {createTemplateMutation.isPending ? "Creating..." : "Create Template"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="p-3 xs:p-4 sm:p-6">
          <CardTitle className="flex items-center text-base xs:text-lg">
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 xs:p-4 sm:p-6 pt-0">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search templates..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-templates"
                />
              </div>
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[200px]" data-testid="select-type-filter">
                <SelectValue placeholder="Filter by candidate type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {candidateTypes.map((type: any) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Templates Table (Desktop) */}
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Candidate Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last Modified</TableHead>
                <TableHead className="w-[150px] text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTemplates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    {templates.length === 0 ? "No templates found. Create your first template to get started." : "No templates found matching your criteria"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredTemplates.map((template: any) => (
                  <TableRow key={template.id} className="hover:bg-muted/50" data-testid={`row-template-${template.id}`}>
                    <TableCell className="font-medium">{template.name}</TableCell>
                    <TableCell>{getCandidateTypeName(template.candidateTypeId)}</TableCell>
                    <TableCell>
                      <Badge variant={template.isActive ? "default" : "secondary"}>
                        {template.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(template.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {new Date(template.updatedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Link href={`/templates/${template.id}`}>
                          <Button variant="ghost" size="sm" data-testid={`button-view-template-${template.id}`}>
                            <Eye className="w-4 h-4" />
                          </Button>
                        </Link>
                        <Link href={`/templates/${template.id}`}>
                          <Button variant="ghost" size="sm" data-testid={`button-edit-template-${template.id}`}>
                            <Edit className="w-4 h-4" />
                          </Button>
                        </Link>
                        {user && ["system_admin", "hr_staff"].includes(user.role) && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                data-testid={`button-delete-template-${template.id}`}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Template?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will archive the template and remove it from the list. This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteTemplateMutation.mutate(template.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  disabled={deleteTemplateMutation.isPending}
                                >
                                  {deleteTemplateMutation.isPending ? "Deleting..." : "Delete"}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Templates (Mobile Cards) */}
      <div className="space-y-3 md:hidden">
        {filteredTemplates.length === 0 ? (
          <Card>
            <CardContent className="p-4 text-center text-muted-foreground text-sm">
              {templates.length === 0 ? "No templates found. Create your first template to get started." : "No templates found matching your criteria"}
            </CardContent>
          </Card>
        ) : (
          filteredTemplates.map((template: any) => (
            <Card key={template.id} className="p-4" data-testid={`card-template-${template.id}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-medium break-words">{template.name}</h3>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Type</span>
                      <div>{getCandidateTypeName(template.candidateTypeId)}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Status</span>
                      <div>
                        <Badge variant={template.isActive ? "default" : "secondary"}>
                          {template.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Created</span>
                      <div>{new Date(template.createdAt).toLocaleDateString()}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Updated</span>
                      <div>{new Date(template.updatedAt).toLocaleDateString()}</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-start gap-2 mt-3 pt-3 border-t">
                <Link href={`/templates/${template.id}`}>
                  <Button variant="ghost" size="sm" className="min-h-[40px]">View</Button>
                </Link>
                <Link href={`/templates/${template.id}`}>
                  <Button variant="ghost" size="sm" className="min-h-[40px]">Edit</Button>
                </Link>
                {user && ["system_admin", "hr_staff"].includes(user.role) && (
                  <Button 
                    variant="ghost" size="sm" className="min-h-[40px] text-destructive"
                    onClick={() => setDeleteTemplateId(template.id)}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </Card>
          ))
        )}
      </div>
      </div>
    </RouteGuard>
  );
}
