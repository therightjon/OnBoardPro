import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Mail, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/shared/components/ui/radio-group";
import { Label } from "@/shared/components/ui/label";
import { Input } from "@/shared/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { Switch } from "@/shared/components/ui/switch";
import { Button } from "@/shared/components/ui/button";
import { useToast } from "@/shared/hooks/use-toast";
import { apiRequest, parseJsonSafe, queryClient } from "@/lib/queryClient";

const SETTINGS_QUERY_KEY = ["/api/settings/email"] as const;

const securityOptions = [
  { value: "none", label: "None", description: "No TLS negotiation. Use for trusted networks only." },
  { value: "starttls", label: "STARTTLS", description: "Upgrade insecure connection. Server must advertise STARTTLS." },
  { value: "ssl_tls", label: "SSL/TLS", description: "Connect via SMTPS (implicit TLS) typically on port 465." },
] as const;

const authOptions = [
  { value: "none", label: "None", description: "No authentication. Typically used with IP allow lists." },
  { value: "plain", label: "PLAIN", description: "Username + password without challenge. Requires TLS." },
  { value: "login", label: "LOGIN", description: "Username + password with LOGIN challenge." },
  { value: "cram_md5", label: "CRAM-MD5", description: "Digest-based challenge/response authentication." },
  { value: "xoauth2", label: "XOAUTH2", description: "Use an OAuth2 access token for authentication." },
] as const;

const formSchema = z.object({
  enabled: z.boolean(),
  hostname: z.string().optional(),
  port: z.number().int().min(1).max(65535),
  security: z.enum(["none", "starttls", "ssl_tls"]),
  authType: z.enum(["none", "plain", "login", "cram_md5", "xoauth2"]),
  username: z.string().optional().nullable(),
  fromName: z.string().optional().nullable(),
  fromEmail: z.string().email("Enter a valid from email address"),
  allowHeaderSpoofing: z.boolean(),
  replacePassword: z.boolean(),
  newPassword: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface SmtpSettingsResponse {
  enabled: boolean;
  hostname: string | null;
  port: number | null;
  security: "none" | "starttls" | "ssl_tls";
  authType: "none" | "plain" | "login" | "cram_md5" | "xoauth2";
  username: string | null;
  fromName: string | null;
  fromEmail: string | null;
  allowHeaderSpoofing: boolean;
  passwordConfigured: boolean;
  passwordSetAt: string | null;
  encryptionVersion: string | null;
  updatedAt: string;
}

function getDefaultPort(security: string | undefined) {
  if (security === "ssl_tls") return 465;
  return 25;
}

export function SmtpSettingsCard() {
  const { toast } = useToast();
  const [initialSettings, setInitialSettings] = useState<SmtpSettingsResponse | null>(null);
  const [isReplacingPassword, setIsReplacingPassword] = useState(false);

  const { data: settings, isLoading, isError, error } = useQuery<SmtpSettingsResponse>({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/settings/email");
      return await res.json();
    },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    mode: "onChange",
    defaultValues: {
      enabled: false,
      hostname: "",
      port: getDefaultPort("none"),
      security: "none",
      authType: "none",
      username: "",
      fromName: "",
      fromEmail: "",
      allowHeaderSpoofing: false,
      replacePassword: false,
      newPassword: "",
    },
  });

  const { control, handleSubmit, formState, reset, watch, setValue } = form;
  const securityValue = watch("security");
  const authTypeValue = watch("authType");
  const enabledValue = watch("enabled");

  useEffect(() => {
    if (settings) {
      setInitialSettings(settings);
      reset({
        enabled: settings.enabled ?? false,
        hostname: settings.hostname ?? "",
        port: settings.port ?? getDefaultPort(settings.security),
        security: settings.security,
        authType: settings.authType,
        username: settings.username ?? "",
        fromName: settings.fromName ?? "",
        fromEmail: settings.fromEmail ?? "",
        allowHeaderSpoofing: settings.allowHeaderSpoofing ?? false,
        replacePassword: false,
        newPassword: "",
      });
      setIsReplacingPassword(false);
    }
  }, [reset, settings]);

  useEffect(() => {
    if (authTypeValue === "none") {
      setIsReplacingPassword(false);
      setValue("replacePassword", false, { shouldDirty: true });
      setValue("newPassword", "", { shouldDirty: false });
    }
  }, [authTypeValue, setValue]);

  const updateMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload: Record<string, unknown> = {
        enabled: values.enabled,
        hostname: values.hostname?.trim() || null,
        port: values.port ?? getDefaultPort(values.security),
        security: values.security,
        authType: values.authType,
        username: values.authType === "none" ? null : (values.username?.trim() || null),
        fromName: values.fromName?.trim() || null,
        fromEmail: values.fromEmail?.trim(),
        allowHeaderSpoofing: values.allowHeaderSpoofing,
      };

      if (isReplacingPassword && values.newPassword) {
        payload.replacePassword = true;
        payload.newPassword = values.newPassword;
      } else {
        payload.replacePassword = false;
      }

      const res = await apiRequest("PATCH", "/api/settings/email", payload);
      return await parseJsonSafe<SmtpSettingsResponse>(res);
    },
    onSuccess: (data) => {
      if (data) {
        toast({ title: "SMTP settings saved" });
        queryClient.setQueryData(SETTINGS_QUERY_KEY, data);
        setInitialSettings(data);
        reset({
          enabled: data.enabled ?? false,
          hostname: data.hostname ?? "",
          port: data.port ?? getDefaultPort(data.security),
          security: data.security,
          authType: data.authType,
          username: data.username ?? "",
          fromName: data.fromName ?? "",
          fromEmail: data.fromEmail ?? "",
          allowHeaderSpoofing: data.allowHeaderSpoofing ?? false,
          replacePassword: false,
          newPassword: "",
        });
        setIsReplacingPassword(false);
      }
    },
    onError: (err: any) => {
      const message = err instanceof Error ? err.message : "Failed to update SMTP settings";
      toast({ title: "Unable to save SMTP settings", description: message, variant: "destructive" });
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/settings/email/test");
      return await parseJsonSafe(res);
    },
    onSuccess: () => {
      toast({ title: "Test email sent", description: "Check your inbox for confirmation." });
    },
    onError: (err: any) => {
      const message = err instanceof Error ? err.message : "SMTP test failed";
      toast({ title: "Test email failed", description: message, variant: "destructive" });
    },
  });

  const handleReplacePasswordToggle = () => {
    if (authTypeValue === "none") return;
    setIsReplacingPassword((prev) => {
      if (prev) {
        setValue("newPassword", "", { shouldDirty: false });
        setValue("replacePassword", false, { shouldDirty: true });
      } else {
        setValue("replacePassword", true, { shouldDirty: true });
      }
      return !prev;
    });
  };

  const handleReset = () => {
    if (initialSettings) {
      reset({
        enabled: initialSettings.enabled ?? false,
        hostname: initialSettings.hostname ?? "",
        port: initialSettings.port ?? getDefaultPort(initialSettings.security),
        security: initialSettings.security,
        authType: initialSettings.authType,
        username: initialSettings.username ?? "",
        fromName: initialSettings.fromName ?? "",
        fromEmail: initialSettings.fromEmail ?? "",
        allowHeaderSpoofing: initialSettings.allowHeaderSpoofing ?? false,
        replacePassword: false,
        newPassword: "",
      });
    }
    setIsReplacingPassword(false);
  };

  const handleCancel = () => {
    handleReset();
  };

  const loadingState = isLoading || !initialSettings;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Mail className="h-5 w-5 shrink-0" />
            SMTP Email Delivery
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure outgoing SMTP notifications. Settings apply to both immediate alerts and scheduled digests.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">Passwords are envelope-encrypted with AES-256-GCM.</span>
          <span className="sm:hidden">AES-256-GCM encrypted</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 min-w-0">
        {isError ? (
          <div className="rounded-md bg-destructive/10 p-4 text-sm text-destructive">
            {error instanceof Error ? error.message : "Failed to load SMTP settings"}
          </div>
        ) : null}

        <form className="space-y-6" onSubmit={handleSubmit((values) => updateMutation.mutate(values))}>
          <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
            <div>
              <Label>Status</Label>
              <p className="text-xs text-muted-foreground">Toggle SMTP delivery on or off.</p>
            </div>
            <Controller
              name="enabled"
              control={control}
              render={({ field }) => (
                <RadioGroup
                  className="flex flex-col gap-2"
                  onValueChange={(value) => field.onChange(value === "true")}
                  value={field.value ? "true" : "false"}
                  disabled={loadingState || updateMutation.isPending}
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="true" id="smtp-enabled" />
                    <Label htmlFor="smtp-enabled" className="text-sm font-normal">
                      Enable SMTP delivery
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="false" id="smtp-disabled" />
                    <Label htmlFor="smtp-disabled" className="text-sm font-normal">
                      Disable (emails suppressed)
                    </Label>
                  </div>
                </RadioGroup>
              )}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
            <div>
              <Label htmlFor="hostname">Hostname</Label>
              <p className="text-xs text-muted-foreground">IPv4 or FQDN of your SMTP server.</p>
            </div>
            <Controller
              name="hostname"
              control={control}
              render={({ field }) => (
                <Input
                  id="hostname"
                  placeholder="smtp.example.com"
                  {...field}
                  disabled={loadingState || updateMutation.isPending}
                />
              )}
            />
          </div>

  {/* Security and Port */}
          <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
            <div>
              <Label>Security</Label>
              <p className="text-xs text-muted-foreground">
                Choose transport security. Default port updates when security changes.
              </p>
            </div>
            <Controller
              name="security"
              control={control}
              render={({ field }) => (
                <Select
                  onValueChange={(value) => {
                    field.onChange(value);
                    const defaultPort = getDefaultPort(value);
                    setValue("port", defaultPort, { shouldDirty: true });
                  }}
                  value={field.value}
                  disabled={loadingState || updateMutation.isPending}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Security" />
                  </SelectTrigger>
                  <SelectContent>
                    {securityOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <div className="sm:col-start-2">
              <p className="text-xs text-muted-foreground">
                {securityOptions.find((option) => option.value === securityValue)?.description}
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
            <div>
              <Label htmlFor="port">Port</Label>
              <p className="text-xs text-muted-foreground">Default port is {getDefaultPort(securityValue)}.</p>
            </div>
            <Controller
              name="port"
              control={control}
              render={({ field }) => (
                <Input
                  id="port"
                  type="number"
                  min={1}
                  max={65535}
                  value={field.value ?? ""}
                  onChange={(event) => field.onChange(event.target.value === "" ? undefined : Number(event.target.value))}
                  disabled={loadingState || updateMutation.isPending}
                />
              )}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
            <div>
              <Label>Authentication</Label>
              <p className="text-xs text-muted-foreground">
                Select how credentials are sent during SMTP handshake.
              </p>
            </div>
            <Controller
              name="authType"
              control={control}
              render={({ field }) => (
                <Select
                  onValueChange={(value) => field.onChange(value)}
                  value={field.value}
                  disabled={loadingState || updateMutation.isPending}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Authentication" />
                  </SelectTrigger>
                  <SelectContent>
                    {authOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <div className="sm:col-start-2">
              <p className="text-xs text-muted-foreground">
                {authOptions.find((option) => option.value === authTypeValue)?.description}
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
            <div>
              <Label htmlFor="username">Username</Label>
              <p className="text-xs text-muted-foreground">Disabled when authentication is set to None.</p>
            </div>
            <Controller
              name="username"
              control={control}
              render={({ field }) => (
                <Input
                  id="username"
                  placeholder="smtp-user"
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  disabled={authTypeValue === "none" || loadingState || updateMutation.isPending}
                />
              )}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
            <div>
              <Label>Password</Label>
              <p className="text-xs text-muted-foreground">
                Stored using envelope encryption. Replace to update credentials.
              </p>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 rounded border border-dashed border-muted px-3 py-2 text-sm">
                <span>
                  {initialSettings?.passwordConfigured ? "Password is configured" : "Password not yet configured"}
                  {initialSettings?.passwordSetAt ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      Updated {new Date(initialSettings.passwordSetAt).toLocaleString()}
                    </span>
                  ) : null}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleReplacePasswordToggle}
                  disabled={authTypeValue === "none" || loadingState || updateMutation.isPending}
                >
                  {isReplacingPassword ? "Cancel" : "Replace"}
                </Button>
              </div>
              {isReplacingPassword ? (
                <Controller
                  name="newPassword"
                  control={control}
                  render={({ field }) => (
                    <Input
                      id="newPassword"
                      type="password"
                      placeholder={authTypeValue === "xoauth2" ? "OAuth2 access token" : "New password"}
                      autoComplete="new-password"
                      {...field}
                      disabled={loadingState || updateMutation.isPending}
                    />
                  )}
                />
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
            <div>
              <Label htmlFor="fromName">From Name</Label>
              <p className="text-xs text-muted-foreground">Display name shown to recipients.</p>
            </div>
            <Controller
              name="fromName"
              control={control}
              render={({ field }) => (
                <Input
                  id="fromName"
                  placeholder="OnBoardPro Notifications"
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  disabled={loadingState || updateMutation.isPending}
                />
              )}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
            <div>
              <Label htmlFor="fromEmail">From Email</Label>
              <p className="text-xs text-muted-foreground">Appears in the from header for outgoing messages.</p>
            </div>
            <Controller
              name="fromEmail"
              control={control}
              render={({ field }) => (
                <Input
                  id="fromEmail"
                  placeholder="notifications@example.com"
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  disabled={loadingState || updateMutation.isPending}
                />
              )}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
            <div>
              <Label htmlFor="allowHeaderSpoofing">Allow header spoofing</Label>
              <p className="text-xs text-muted-foreground">
                Permit per-message overrides of the From header. Disable for strict DMARC environments.
              </p>
            </div>
            <Controller
              name="allowHeaderSpoofing"
              control={control}
              render={({ field }) => (
                <div className="flex items-center gap-3">
                  <Switch
                    id="allowHeaderSpoofing"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={loadingState || updateMutation.isPending}
                  />
                  <span className="text-sm text-muted-foreground">{field.value ? "Enabled" : "Disabled"}</span>
                </div>
              )}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={
                  loadingState ||
                  updateMutation.isPending ||
                  !formState.isDirty ||
                  !formState.isValid ||
                  (isReplacingPassword && !form.getValues("newPassword"))
                }
              >
                Save changes
              </Button>
              <Button type="button" variant="outline" onClick={handleReset} disabled={loadingState || updateMutation.isPending}>
                Reset
              </Button>
              <Button type="button" variant="ghost" onClick={handleCancel} disabled={loadingState || updateMutation.isPending}>
                Cancel
              </Button>
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={() => testMutation.mutate()}
              disabled={loadingState || testMutation.isPending || !enabledValue}
            >
              Send test
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
