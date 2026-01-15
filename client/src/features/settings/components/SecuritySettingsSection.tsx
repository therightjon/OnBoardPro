/**
 * SecuritySettingsSection - Session timeout configuration
 * 
 * System Admin only section for configuring session idle and absolute timeouts.
 * Uses the SettingsSection/SettingsGroup/SettingsRow pattern for consistency.
 */
import { useEffect } from "react";
import { Shield } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/shared/hooks/use-toast";

// UI Components
import { SettingsSection } from "@/shared/components/settings/SettingsSection";
import { SettingsGroup } from "@/shared/components/settings/SettingsGroup";
import { SettingsRow } from "@/shared/components/settings/SettingsRow";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";

const SETTINGS_QUERY_KEY = ["/api/settings/security"] as const;

// Validation schema matching server-side constraints
const securitySettingsSchema = z.object({
  session_idle_timeout_hours: z.coerce
    .number()
    .min(0.1, "Minimum 6 minutes (0.1 hours)")
    .max(24, "Maximum 24 hours"),
  session_absolute_timeout_hours: z.coerce
    .number()
    .min(1, "Minimum 1 hour")
    .max(168, "Maximum 168 hours (1 week)"),
});

type SecuritySettingsForm = z.infer<typeof securitySettingsSchema>;

interface SecuritySettingsResponse {
  session_idle_timeout_hours: number;
  session_absolute_timeout_hours: number;
}

export function SecuritySettingsSection() {
  const { user } = useAuth();
  const { toast } = useToast();

  // Only render for system_admin
  if (user?.role !== "system_admin") {
    return null;
  }

  return <SecuritySettingsContent />;
}

function SecuritySettingsContent() {
  const { toast } = useToast();

  // Query current security settings
  const { data: settings, isLoading, isError } = useQuery<SecuritySettingsResponse>({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/settings/security");
      return res.json();
    },
  });

  const form = useForm<SecuritySettingsForm>({
    resolver: zodResolver(securitySettingsSchema),
    mode: "onChange",
    defaultValues: {
      session_idle_timeout_hours: 2,
      session_absolute_timeout_hours: 24,
    },
  });

  const { control, handleSubmit, formState, reset } = form;
  const { isDirty, isValid, errors } = formState;

  // Reset form when settings load
  useEffect(() => {
    if (settings) {
      reset({
        session_idle_timeout_hours: settings.session_idle_timeout_hours,
        session_absolute_timeout_hours: settings.session_absolute_timeout_hours,
      });
    }
  }, [settings, reset]);

  // Mutation for updating settings
  const updateMutation = useMutation({
    mutationFn: async (values: SecuritySettingsForm) => {
      const res = await apiRequest("PATCH", "/api/settings/security", values);
      return res.json();
    },
    onSuccess: (data: SecuritySettingsResponse) => {
      queryClient.setQueryData(SETTINGS_QUERY_KEY, data);
      reset(data);
      toast({
        title: "Security settings saved",
        description: "Session timeout settings have been updated. Changes take effect on new requests.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to save settings",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: SecuritySettingsForm) => {
    updateMutation.mutate(values);
  };

  const handleCancel = () => {
    if (settings) {
      reset({
        session_idle_timeout_hours: settings.session_idle_timeout_hours,
        session_absolute_timeout_hours: settings.session_absolute_timeout_hours,
      });
    }
  };

  if (isLoading) {
    return (
      <SettingsSection
        title="Security Settings"
        description="Configure session security and timeout policies."
        icon={Shield}
        data-testid="settings-section-security"
      >
        <div className="text-muted-foreground text-sm">Loading security settings...</div>
      </SettingsSection>
    );
  }

  if (isError) {
    return (
      <SettingsSection
        title="Security Settings"
        description="Configure session security and timeout policies."
        icon={Shield}
        data-testid="settings-section-security"
      >
        <div className="text-destructive text-sm">Failed to load security settings.</div>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      title="Security Settings"
      description="Configure session security and timeout policies. Only System Administrators can modify these settings."
      icon={Shield}
      data-testid="settings-section-security"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        <SettingsGroup
          label="Session Timeouts"
          description="Control how long user sessions remain active. These settings affect all users."
        >
          <SettingsRow
            label="Idle Timeout (hours)"
            helperText="Sessions will expire after this period of inactivity. Users must log in again after being idle. Range: 0.1 to 24 hours."
          >
            <div className="flex flex-col gap-1">
              <Controller
                name="session_idle_timeout_hours"
                control={control}
                render={({ field }) => (
                  <Input
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="24"
                    className="w-28"
                    {...field}
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                    data-testid="input-idle-timeout"
                  />
                )}
              />
              {errors.session_idle_timeout_hours && (
                <span className="text-xs text-destructive">
                  {errors.session_idle_timeout_hours.message}
                </span>
              )}
            </div>
          </SettingsRow>

          <SettingsRow
            label="Maximum Session Duration (hours)"
            helperText="Sessions will expire after this time regardless of activity. This prevents indefinite session extension. Range: 1 to 168 hours (1 week)."
          >
            <div className="flex flex-col gap-1">
              <Controller
                name="session_absolute_timeout_hours"
                control={control}
                render={({ field }) => (
                  <Input
                    type="number"
                    step="1"
                    min="1"
                    max="168"
                    className="w-28"
                    {...field}
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                    data-testid="input-absolute-timeout"
                  />
                )}
              />
              {errors.session_absolute_timeout_hours && (
                <span className="text-xs text-destructive">
                  {errors.session_absolute_timeout_hours.message}
                </span>
              )}
            </div>
          </SettingsRow>
        </SettingsGroup>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-4 border-t">
          <Button
            type="submit"
            disabled={!isDirty || !isValid || updateMutation.isPending}
            data-testid="button-save-security-settings"
          >
            {updateMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={!isDirty || updateMutation.isPending}
            data-testid="button-cancel-security-settings"
          >
            Cancel
          </Button>
        </div>
      </form>
    </SettingsSection>
  );
}

export default SecuritySettingsSection;
