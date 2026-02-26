/**
 * EmailTemplatesCard — Main management UI for email templates.
 *
 * Features:
 * - Template type selector (dropdown)
 * - Subject field with variable insertion
 * - WYSIWYG body editor (Tiptap) with toolbar & variable insertion
 * - Live preview (rendered HTML in iframe sandbox)
 * - Send test email
 * - Reset to default
 * - Active/inactive toggle
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Mail,
  Eye,
  EyeOff,
  RotateCcw,
  Send,
  Save,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Switch } from "@/shared/components/ui/switch";
import { Badge } from "@/shared/components/ui/badge";
import { Separator } from "@/shared/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/shared/components/ui/alert-dialog";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { apiRequest, queryClient, parseJsonSafe } from "@/lib/queryClient";
import { TemplateEditor, insertVariableIntoEditor, type Editor } from "./TemplateEditor";
import { VariableInsertDialog } from "./VariableInsertDialog";
import {
  EMAIL_TEMPLATE_TYPES,
  EMAIL_TEMPLATE_LABELS,
  TEMPLATE_VARIABLES,
  VARIABLES_BY_TEMPLATE_TYPE,
  type EmailTemplateType,
  type EmailTemplate,
  type TemplateVariable,
} from "@shared/schemas/email-template.schema";

// ============================================================================
// TYPES
// ============================================================================

interface TemplateListItem extends EmailTemplate {
  label: string;
}

interface TemplateDetail extends EmailTemplate {
  label: string;
  variables: TemplateVariable[];
}

interface PreviewResult {
  subject: string;
  html: string;
}

// ============================================================================
// QUERY KEYS
// ============================================================================

const TEMPLATES_LIST_KEY = ["/api/settings/email-templates"] as const;
const templateDetailKey = (type: string) =>
  ["/api/settings/email-templates", type] as const;

// ============================================================================
// COMPONENT
// ============================================================================

export function EmailTemplatesCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "system_admin";

  // State
  const [selectedType, setSelectedType] = useState<EmailTemplateType>("task.assigned");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [isDirty, setIsDirty] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [variableDialogOpen, setVariableDialogOpen] = useState(false);
  const [variableTarget, setVariableTarget] = useState<"subject" | "body">("body");

  // Ref for editor to insert variables
  const editorRef = useRef<Editor | null>(null);
  const subjectInputRef = useRef<HTMLInputElement>(null);

  // ========================================================================
  // QUERIES
  // ========================================================================

  const {
    data: templates,
    isLoading: loadingList,
  } = useQuery<TemplateListItem[]>({
    queryKey: TEMPLATES_LIST_KEY,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/settings/email-templates");
      return parseJsonSafe(res, "email-templates");
    },
  });

  const {
    data: templateDetail,
    isLoading: loadingDetail,
  } = useQuery<TemplateDetail>({
    queryKey: templateDetailKey(selectedType),
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/settings/email-templates/${selectedType}`);
      return parseJsonSafe(res, "email-template-detail");
    },
    enabled: !!selectedType,
  });

  // Preview query — only when showPreview is true
  const {
    data: preview,
    isLoading: loadingPreview,
  } = useQuery<PreviewResult>({
    queryKey: ["/api/settings/email-templates", selectedType, "preview", subject, body],
    queryFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/settings/email-templates/${selectedType}/preview`,
        { subjectTemplate: subject, bodyTemplate: body }
      );
      return parseJsonSafe(res, "email-template-preview");
    },
    enabled: showPreview && !!selectedType,
  });

  // ========================================================================
  // MUTATIONS
  // ========================================================================

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "PUT",
        `/api/settings/email-templates/${selectedType}`,
        { subjectTemplate: subject, bodyTemplate: body, isActive }
      );
      return parseJsonSafe<EmailTemplate>(res, "save-template");
    },
    onSuccess: () => {
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: TEMPLATES_LIST_KEY });
      queryClient.invalidateQueries({ queryKey: templateDetailKey(selectedType) });
      toast({ title: "Template saved", description: "Email template updated successfully." });
    },
    onError: (error: Error) => {
      toast({
        title: "Save failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/settings/email-templates/${selectedType}/reset`
      );
      return parseJsonSafe<EmailTemplate>(res, "reset-template");
    },
    onSuccess: (data) => {
      setSubject(data.subjectTemplate);
      setBody(data.bodyTemplate);
      setIsActive(data.isActive);
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: TEMPLATES_LIST_KEY });
      queryClient.invalidateQueries({ queryKey: templateDetailKey(selectedType) });
      toast({ title: "Template reset", description: "Restored to factory default." });
    },
    onError: (error: Error) => {
      toast({
        title: "Reset failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const testEmailMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        `/api/settings/email-templates/${selectedType}/test`,
        { subjectTemplate: subject, bodyTemplate: body }
      );
      return parseJsonSafe(res, "test-email");
    },
    onSuccess: () => {
      toast({ title: "Test email sent", description: `Sent to ${user?.email ?? "your email"}.` });
    },
    onError: (error: Error) => {
      toast({
        title: "Test email failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // ========================================================================
  // SYNC TEMPLATE DETAIL → LOCAL STATE
  // ========================================================================

  useEffect(() => {
    if (templateDetail && !isDirty) {
      setSubject(templateDetail.subjectTemplate);
      setBody(templateDetail.bodyTemplate);
      setIsActive(templateDetail.isActive);
    }
  }, [templateDetail, isDirty]);

  // Reset dirty state when switching types
  useEffect(() => {
    setIsDirty(false);
    setShowPreview(false);
  }, [selectedType]);

  // ========================================================================
  // VARIABLE INSERTION
  // ========================================================================

  const availableVariables = VARIABLES_BY_TEMPLATE_TYPE[selectedType]
    ? TEMPLATE_VARIABLES.filter((v) =>
        VARIABLES_BY_TEMPLATE_TYPE[selectedType].includes(v.name)
      )
    : [];

  const handleInsertVariable = useCallback(
    (variableName: string) => {
      if (variableTarget === "subject") {
        const input = subjectInputRef.current;
        if (input) {
          const start = input.selectionStart ?? subject.length;
          const end = input.selectionEnd ?? subject.length;
          const newSubject =
            subject.slice(0, start) + `{{${variableName}}}` + subject.slice(end);
          setSubject(newSubject);
          setIsDirty(true);
          requestAnimationFrame(() => {
            const newPos = start + variableName.length + 4;
            input.setSelectionRange(newPos, newPos);
            input.focus();
          });
        }
      } else {
        insertVariableIntoEditor(editorRef.current, variableName);
        setIsDirty(true);
      }
    },
    [variableTarget, subject]
  );

  const openVariableDialog = useCallback((target: "subject" | "body") => {
    setVariableTarget(target);
    setVariableDialogOpen(true);
  }, []);

  // ========================================================================
  // RENDER
  // ========================================================================

  const isLoading = loadingList || loadingDetail;
  const isSaving = saveMutation.isPending;
  const isResetting = resetMutation.isPending;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="h-5 w-5" />
              Email Templates
            </CardTitle>
            {isDirty && (
              <Badge variant="secondary" className="text-xs">
                Unsaved changes
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Customize the content of notification emails. Use template variables to include
            dynamic values like candidate names, task titles, and more.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Template Type Selector */}
          <div className="space-y-1.5">
            <Label htmlFor="template-type">Notification Type</Label>
            <Select
              value={selectedType}
              onValueChange={(val) => setSelectedType(val as EmailTemplateType)}
            >
              <SelectTrigger id="template-type" className="w-full sm:w-[300px]">
                <SelectValue placeholder="Select template type" />
              </SelectTrigger>
              <SelectContent>
                {EMAIL_TEMPLATE_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {EMAIL_TEMPLATE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading template...
            </div>
          ) : (
            <>
              {/* Active toggle */}
              <div className="flex items-center justify-between border rounded-lg p-3 bg-muted/20">
                <div>
                  <p className="text-sm font-medium">Email active</p>
                  <p className="text-xs text-muted-foreground">
                    When disabled, this notification type won't send emails.
                  </p>
                </div>
                <Switch
                  checked={isActive}
                  onCheckedChange={(checked) => {
                    setIsActive(checked);
                    setIsDirty(true);
                  }}
                  disabled={!isAdmin}
                />
              </div>

              {/* Subject */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="template-subject">Subject Line</Label>
                  {isAdmin && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => openVariableDialog("subject")}
                    >
                      + Variable
                    </Button>
                  )}
                </div>
                <Input
                  id="template-subject"
                  ref={subjectInputRef}
                  value={subject}
                  onChange={(e) => {
                    setSubject(e.target.value);
                    setIsDirty(true);
                  }}
                  readOnly={!isAdmin}
                  placeholder="Email subject..."
                  className="font-mono text-sm"
                />
              </div>

              {/* Body Editor */}
              <div className="space-y-1.5">
                <Label>Email Body</Label>
                <TemplateEditor
                  content={body}
                  onChange={(html) => {
                    setBody(html);
                    setIsDirty(true);
                  }}
                  variables={availableVariables}
                  onInsertVariable={() => openVariableDialog("body")}
                  readOnly={!isAdmin}
                  editorRef={editorRef}
                />
              </div>

              <Separator />

              {/* Actions */}
              <div className="flex flex-wrap gap-2">
                {isAdmin && (
                  <>
                    <Button
                      onClick={() => saveMutation.mutate()}
                      disabled={!isDirty || isSaving}
                      size="sm"
                    >
                      {isSaving ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                      ) : (
                        <Save className="h-4 w-4 mr-1.5" />
                      )}
                      Save
                    </Button>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" disabled={isResetting}>
                          {isResetting ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                          ) : (
                            <RotateCcw className="h-4 w-4 mr-1.5" />
                          )}
                          Reset to Default
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Reset template?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will replace the current template with the factory default.
                            Any customizations will be lost.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => resetMutation.mutate()}>
                            Reset
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPreview(!showPreview)}
                >
                  {showPreview ? (
                    <EyeOff className="h-4 w-4 mr-1.5" />
                  ) : (
                    <Eye className="h-4 w-4 mr-1.5" />
                  )}
                  {showPreview ? "Hide Preview" : "Preview"}
                </Button>

                {isAdmin && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testEmailMutation.mutate()}
                    disabled={testEmailMutation.isPending}
                  >
                    {testEmailMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                    ) : (
                      <Send className="h-4 w-4 mr-1.5" />
                    )}
                    Send Test
                  </Button>
                )}
              </div>

              {/* Preview */}
              {showPreview && (
                <div className="space-y-3">
                  <Separator />
                  <div className="space-y-2">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <Eye className="h-4 w-4" />
                      Preview (with sample data)
                    </Label>
                    {loadingPreview ? (
                      <div className="flex items-center justify-center py-8 border rounded-md bg-muted/10">
                        <Loader2 className="h-5 w-5 animate-spin mr-2 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Rendering preview...</span>
                      </div>
                    ) : preview ? (
                      <div className="space-y-2">
                        <div className="border rounded-md p-3 bg-muted/10">
                          <p className="text-xs text-muted-foreground mb-1">Subject:</p>
                          <p className="text-sm font-medium">{preview.subject}</p>
                        </div>
                        <div className="border rounded-md overflow-hidden">
                          <iframe
                            title="Email preview"
                            srcDoc={preview.html}
                            className="w-full min-h-[300px] bg-white"
                            sandbox="allow-same-origin"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center py-8 border rounded-md bg-muted/10 text-sm text-muted-foreground">
                        <AlertTriangle className="h-4 w-4 mr-2" />
                        Could not render preview.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Variable Insert Dialog */}
      <VariableInsertDialog
        open={variableDialogOpen}
        onOpenChange={setVariableDialogOpen}
        variables={availableVariables}
        onSelect={handleInsertVariable}
      />
    </>
  );
}
