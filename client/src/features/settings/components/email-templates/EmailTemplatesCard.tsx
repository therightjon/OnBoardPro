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
  ChevronDown,
  Settings2,
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/shared/components/ui/collapsible";
import { TemplateEditor, insertVariableIntoEditor, type Editor } from "./TemplateEditor";
import { VariableInsertDialog } from "./VariableInsertDialog";
import { ColorPickerPopover } from "./ColorPickerPopover";
import {
  EMAIL_TEMPLATE_TYPES,
  EMAIL_TEMPLATE_LABELS,
  TEMPLATE_VARIABLES,
  VARIABLES_BY_TEMPLATE_TYPE,
  EMAIL_GLOBAL_DEFAULTS,
  type EmailTemplateType,
  type EmailTemplate,
  type EmailGlobalSettings,
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
const GLOBAL_SETTINGS_KEY = ["/api/settings/email-global"] as const;
const templateDetailKey = (type: string) =>
  ["/api/settings/email-templates", type] as const;

// ============================================================================
// GLOBAL EMAIL LAYOUT SECTION
// ============================================================================

/** Labeled color picker field for global layout settings */
function LayoutColorField({
  label,
  color,
  onChange,
  disabled,
}: {
  label: string;
  color: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <ColorPickerPopover
        currentColor={color}
        onSelect={(c) => c && onChange(c)}
        title={label}
        showClear={false}
      >
        <button
          type="button"
          disabled={disabled}
          className="flex items-center gap-2 h-9 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background hover:bg-accent/50 disabled:opacity-50"
        >
          <span
            className="h-4 w-4 rounded border border-border flex-shrink-0"
            style={{ backgroundColor: color }}
          />
          <span className="font-mono text-xs text-muted-foreground">{color}</span>
        </button>
      </ColorPickerPopover>
    </div>
  );
}

/** Mutable type for editable global layout fields */
interface GlobalLayoutFields {
  headerText: string;
  headerBgColor: string;
  headerTextColor: string;
  footerText: string;
  footerBgColor: string;
  footerTextColor: string;
  pageBgColor: string;
  cardBgColor: string;
}

function GlobalEmailLayout({ isAdmin }: { isAdmin: boolean }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState<GlobalLayoutFields>({ ...EMAIL_GLOBAL_DEFAULTS });
  const [dirty, setDirty] = useState(false);

  const { data: settings, isLoading } = useQuery<EmailGlobalSettings>({
    queryKey: GLOBAL_SETTINGS_KEY,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/settings/email-global");
      return parseJsonSafe(res, "email-global-settings");
    },
  });

  // Sync fetched settings → local state
  useEffect(() => {
    if (settings && !dirty) {
      setLocal({
        headerText: settings.headerText,
        headerBgColor: settings.headerBgColor,
        headerTextColor: settings.headerTextColor,
        footerText: settings.footerText,
        footerBgColor: settings.footerBgColor,
        footerTextColor: settings.footerTextColor,
        pageBgColor: settings.pageBgColor,
        cardBgColor: settings.cardBgColor,
      });
    }
  }, [settings, dirty]);

  const update = <K extends keyof typeof local>(key: K, value: (typeof local)[K]) => {
    setLocal((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", "/api/settings/email-global", local);
      return parseJsonSafe<EmailGlobalSettings>(res, "save-global");
    },
    onSuccess: () => {
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: GLOBAL_SETTINGS_KEY });
      // Also invalidate template previews so they reflect new layout
      queryClient.invalidateQueries({ queryKey: TEMPLATES_LIST_KEY });
      toast({ title: "Layout saved", description: "Global email layout updated." });
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/settings/email-global/reset");
      return parseJsonSafe<EmailGlobalSettings>(res, "reset-global");
    },
    onSuccess: (data) => {
      setLocal({
        headerText: data.headerText,
        headerBgColor: data.headerBgColor,
        headerTextColor: data.headerTextColor,
        footerText: data.footerText,
        footerBgColor: data.footerBgColor,
        footerTextColor: data.footerTextColor,
        pageBgColor: data.pageBgColor,
        cardBgColor: data.cardBgColor,
      });
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: GLOBAL_SETTINGS_KEY });
      queryClient.invalidateQueries({ queryKey: TEMPLATES_LIST_KEY });
      toast({ title: "Layout reset", description: "Restored to factory defaults." });
    },
    onError: (e: Error) => toast({ title: "Reset failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-lg border p-3 hover:bg-muted/40 transition-colors text-left"
        >
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Global Email Layout</span>
            {dirty && (
              <Badge variant="secondary" className="text-xs ml-1">
                Unsaved
              </Badge>
            )}
          </div>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border border-t-0 rounded-b-lg p-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            These settings control the shared header, footer, and background colors
            for all notification emails.
          </p>

          {isLoading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Loading layout settings...
            </div>
          ) : (
            <>
              {/* Header */}
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Header</legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1 sm:col-span-1">
                    <Label className="text-xs" htmlFor="global-header-text">Text</Label>
                    <Input
                      id="global-header-text"
                      value={local.headerText}
                      onChange={(e) => update("headerText", e.target.value)}
                      readOnly={!isAdmin}
                      className="text-sm"
                      placeholder="Header text"
                    />
                  </div>
                  <LayoutColorField
                    label="Background"
                    color={local.headerBgColor}
                    onChange={(c) => update("headerBgColor", c)}
                    disabled={!isAdmin}
                  />
                  <LayoutColorField
                    label="Text Color"
                    color={local.headerTextColor}
                    onChange={(c) => update("headerTextColor", c)}
                    disabled={!isAdmin}
                  />
                </div>
              </fieldset>

              {/* Footer */}
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Footer</legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1 sm:col-span-1">
                    <Label className="text-xs" htmlFor="global-footer-text">Text</Label>
                    <Input
                      id="global-footer-text"
                      value={local.footerText}
                      onChange={(e) => update("footerText", e.target.value)}
                      readOnly={!isAdmin}
                      className="text-sm"
                      placeholder="Footer text"
                    />
                  </div>
                  <LayoutColorField
                    label="Background"
                    color={local.footerBgColor}
                    onChange={(c) => update("footerBgColor", c)}
                    disabled={!isAdmin}
                  />
                  <LayoutColorField
                    label="Text Color"
                    color={local.footerTextColor}
                    onChange={(c) => update("footerTextColor", c)}
                    disabled={!isAdmin}
                  />
                </div>
              </fieldset>

              {/* Page & card backgrounds */}
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Backgrounds</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <LayoutColorField
                    label="Page Background"
                    color={local.pageBgColor}
                    onChange={(c) => update("pageBgColor", c)}
                    disabled={!isAdmin}
                  />
                  <LayoutColorField
                    label="Card Background"
                    color={local.cardBgColor}
                    onChange={(c) => update("cardBgColor", c)}
                    disabled={!isAdmin}
                  />
                </div>
              </fieldset>

              {/* Actions */}
              {isAdmin && (
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    onClick={() => saveMutation.mutate()}
                    disabled={!dirty || saveMutation.isPending}
                  >
                    {saveMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                    ) : (
                      <Save className="h-4 w-4 mr-1.5" />
                    )}
                    Save Layout
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" disabled={resetMutation.isPending}>
                        {resetMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                        ) : (
                          <RotateCcw className="h-4 w-4 mr-1.5" />
                        )}
                        Reset to Default
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Reset email layout?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will restore the global header, footer, and background colors
                          to their factory defaults.
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
                </div>
              )}
            </>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

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
          {/* Global Email Layout — shared header/footer/backgrounds */}
          <GlobalEmailLayout isAdmin={isAdmin} />

          <Separator />

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
                            sandbox="allow-same-origin allow-scripts"
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
