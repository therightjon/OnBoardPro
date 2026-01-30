/**
 * Settings Page - Refactored
 * 
 * Cleanly separates into two main sections:
 * 1. Personal Settings - Available to all users
 * 2. System Settings - Only available to admins (system_admin, hr_staff)
 * 
 * Uses modular components for each settings area.
 */
import { useAuth } from "@/features/auth/hooks/use-auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Card, CardContent } from "@/shared/components/ui/card";
import {
  Settings as SettingsIcon,
  User,
  Building,
  Users,
  Target,
  Key
} from "lucide-react";

// Personal Settings Components
import { ThemeSettings, NotificationsCard, UserPreferencesCard } from "@/features/settings";

// System Settings Components
import { 
  DepartmentsSection,
  DivisionsSection,
  HiringStagesSection,
  SystemPreferencesSection,
  UsersSection,
  AuthenticationSettingsSection,
  SmtpSettingsCard,
  SecuritySettingsSection
} from "@/features/settings";

// ============================================================================
// PERMISSION HELPERS
// ============================================================================

/**
 * Check if user has admin-level access (can view/modify system settings)
 */
function useSystemAdminAccess() {
  const { user } = useAuth();
  return user?.role === "system_admin" || user?.role === "hr_staff";
}

// ============================================================================
// PERSONAL SETTINGS TAB
// ============================================================================

function PersonalSettingsTab() {
  return (
    <div className="space-y-6">
      <ThemeSettings />
      <UserPreferencesCard />
      <NotificationsCard />
    </div>
  );
}

// ============================================================================
// SYSTEM SETTINGS TABS
// ============================================================================

function OrganizationTab() {
  return (
    <div className="space-y-6">
      <DepartmentsSection />
      <DivisionsSection />
    </div>
  );
}

function UsersTab() {
  return (
    <div className="space-y-6">
      <UsersSection />
    </div>
  );
}

function HiringStagesTab() {
  return (
    <div className="space-y-6">
      <HiringStagesSection />
    </div>
  );
}

function AuthenticationTab() {
  return (
    <div className="space-y-6">
      <AuthenticationSettingsSection />
    </div>
  );
}

function SystemTab() {
  return (
    <div className="space-y-6">
      <SmtpSettingsCard />
      <SecuritySettingsSection />
      <SystemPreferencesSection />
    </div>
  );
}

// ============================================================================
// MAIN SETTINGS PAGE
// ============================================================================

export default function SettingsPage() {
  const { user } = useAuth();
  const canAccessSystemSettings = useSystemAdminAccess();

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 min-w-0 overflow-hidden">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-foreground" data-testid="text-settings-title">
            Settings
          </h1>
          <p className="text-sm text-muted-foreground">
            {canAccessSystemSettings
              ? "Manage your preferences and organization settings"
              : "Manage your personal preferences"
            }
          </p>
        </div>
      </div>

      <Tabs defaultValue="personal" className="w-full">
        <Card>
          <CardContent className="p-3 sm:p-4">
            <TabsList className="flex w-full flex-wrap h-auto gap-1 bg-transparent p-0 sm:inline-flex sm:flex-nowrap sm:bg-muted sm:p-1 sm:gap-0">
              {/* Personal Settings - Always visible */}
              <TabsTrigger
                value="personal"
                data-testid="tab-personal"
                className="capitalize text-xs sm:text-sm flex-1 sm:flex-initial data-[state=active]:bg-background data-[state=active]:shadow-sm border border-border sm:border-0"
              >
                <User className="w-4 h-4 mr-1.5 shrink-0" />
                Personal
              </TabsTrigger>

              {/* System Settings - Only for admins */}
              {canAccessSystemSettings && (
                <>
                  <TabsTrigger
                    value="organization"
                    data-testid="tab-organization"
                    className="capitalize text-xs sm:text-sm flex-1 sm:flex-initial data-[state=active]:bg-background data-[state=active]:shadow-sm border border-border sm:border-0"
                  >
                    <Building className="w-4 h-4 mr-1.5 shrink-0" />
                    Organization
                  </TabsTrigger>
                  <TabsTrigger
                    value="users"
                    data-testid="tab-users"
                    className="capitalize text-xs sm:text-sm flex-1 sm:flex-initial data-[state=active]:bg-background data-[state=active]:shadow-sm border border-border sm:border-0"
                  >
                    <Users className="w-4 h-4 mr-1.5 shrink-0" />
                    Users
                  </TabsTrigger>
                  <TabsTrigger
                    value="hiring-stages"
                    data-testid="tab-hiring-stages"
                    className="capitalize text-xs sm:text-sm flex-1 sm:flex-initial data-[state=active]:bg-background data-[state=active]:shadow-sm border border-border sm:border-0"
                  >
                    <Target className="w-4 h-4 mr-1.5 shrink-0" />
                    Hiring
                  </TabsTrigger>
                  <TabsTrigger
                    value="authentication"
                    data-testid="tab-authentication"
                    className="capitalize text-xs sm:text-sm flex-1 sm:flex-initial data-[state=active]:bg-background data-[state=active]:shadow-sm border border-border sm:border-0"
                  >
                    <Key className="w-4 h-4 mr-1.5 shrink-0" />
                    Authentication
                  </TabsTrigger>
                  <TabsTrigger
                    value="system"
                    data-testid="tab-system"
                    className="capitalize text-xs sm:text-sm flex-1 sm:flex-initial data-[state=active]:bg-background data-[state=active]:shadow-sm border border-border sm:border-0"
                  >
                    <SettingsIcon className="w-4 h-4 mr-1.5 shrink-0" />
                    System
                  </TabsTrigger>
                </>
              )}
            </TabsList>
          </CardContent>
        </Card>

        {/* Tab Contents */}
        <TabsContent value="personal" className="mt-6 min-h-[70vh]">
          <PersonalSettingsTab />
        </TabsContent>

        {canAccessSystemSettings && (
          <>
            <TabsContent value="organization" className="mt-6 min-h-[70vh]">
              <OrganizationTab />
            </TabsContent>
            <TabsContent value="users" className="mt-6 min-h-[70vh]">
              <UsersTab />
            </TabsContent>
            <TabsContent value="hiring-stages" className="mt-6 min-h-[70vh]">
              <HiringStagesTab />
            </TabsContent>
            <TabsContent value="authentication" className="mt-6 min-h-[70vh]">
              <AuthenticationTab />
            </TabsContent>
            <TabsContent value="system" className="mt-6 min-h-[70vh]">
              <SystemTab />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
