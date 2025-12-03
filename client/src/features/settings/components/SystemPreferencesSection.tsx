/**
 * SystemPreferencesSection - Global system configuration settings
 * System-level settings that affect the entire organization
 */
import { Settings, AlertTriangle } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/shared/hooks/use-toast";

// UI Components
import { SettingsSection } from "@/shared/components/settings/SettingsSection";
import { SettingsGroup } from "@/shared/components/settings/SettingsGroup";
import { SettingsRow } from "@/shared/components/settings/SettingsRow";
import { DangerZone } from "@/shared/components/settings/DangerZone";
import { Switch } from "@/shared/components/ui/switch";
import { Button } from "@/shared/components/ui/button";

export function SystemPreferencesSection() {
  const { user } = useAuth();
  const { toast } = useToast();

  // Query system settings
  const { data: systemSettings = { auto_regress_on_prior_open: false } } = useQuery({
    queryKey: ["/api/system-settings", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/system-settings");
      return res.json();
    },
  });

  // Mutation for toggling auto-regress
  const toggleAutoRegress = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiRequest("PATCH", "/api/system-settings", { auto_regress_on_prior_open: enabled });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system-settings"] });
      toast({ title: "Setting updated", description: "System preference saved successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <SettingsSection
      title="System Preferences"
      description="Configure global settings that affect the entire organization's workflow."
      icon={Settings}
      data-testid="settings-section-system-preferences"
    >
      <div className="space-y-8">
        {/* Workflow Settings */}
        <SettingsGroup
          label="Workflow Behavior"
          description="Settings that affect how candidates progress through the hiring pipeline."
        >
          <SettingsRow
            label="Auto-regress on prior stage reopen"
            helperText="When enabled, if a task in a prior stage is reopened, the candidate will automatically regress to that stage. This ensures all prior work is complete before proceeding."
          >
            <Switch
              checked={!!(systemSettings as any)?.auto_regress_on_prior_open}
              onCheckedChange={(v) => toggleAutoRegress.mutate(v)}
              disabled={toggleAutoRegress.isPending}
              data-testid="switch-auto-regress-prior-open"
            />
          </SettingsRow>

          <SettingsRow
            label="Email Notifications"
            helperText="Enable system-wide email notifications for task assignments and deadline reminders."
          >
            <Switch defaultChecked data-testid="switch-email-notifications" />
          </SettingsRow>

          <SettingsRow
            label="Auto-save Changes"
            helperText="Automatically save form changes as users type to prevent data loss."
          >
            <Switch defaultChecked data-testid="switch-auto-save" />
          </SettingsRow>
        </SettingsGroup>

        {/* Experimental Features */}
        <SettingsGroup
          label="Experimental Features"
          description="Preview features that are still in development."
        >
          <SettingsRow
            label="Enable Beta Features"
            helperText="Allow access to experimental features that may change or be removed. Not recommended for production use."
          >
            <Switch data-testid="switch-beta-features" />
          </SettingsRow>
        </SettingsGroup>

        {/* Data & Privacy - separated from main settings for visibility */}
        <div className="border-t pt-6">
          <SettingsGroup
            label="Data & Privacy"
            description="Manage data exports and privacy settings for your organization."
          >
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" data-testid="button-export-data">
                Export Organization Data
              </Button>
              <Button variant="outline" data-testid="button-privacy-settings">
                Privacy Settings
              </Button>
              <Button variant="outline" data-testid="button-audit-log">
                View Audit Log
              </Button>
            </div>
          </SettingsGroup>
        </div>

        {/* Danger Zone - visually distinct for high-risk actions */}
        <DangerZone
          title="Danger Zone"
          description="These actions are irreversible. Please proceed with caution."
        >
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" className="border-destructive/50 text-destructive hover:bg-destructive/10">
              Reset All Settings to Default
            </Button>
            <Button variant="outline" className="border-destructive/50 text-destructive hover:bg-destructive/10">
              Purge Inactive Data
            </Button>
          </div>
        </DangerZone>
      </div>
    </SettingsSection>
  );
}

export default SystemPreferencesSection;
