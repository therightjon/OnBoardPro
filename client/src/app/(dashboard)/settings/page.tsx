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
import { 
  Settings as SettingsIcon, 
  User,
  Shield,
  Building,
  Users,
  Target,
  Key,
  Mail
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
  SmtpSettingsCard
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

  // Calculate grid columns based on available tabs
  const systemTabCount = canAccessSystemSettings ? 5 : 0; // org, users, hiring, auth, system
  const totalTabs = 1 + systemTabCount; // personal + system tabs (if admin)
  
  const getGridCols = () => {
    if (!canAccessSystemSettings) return "grid-cols-1";
    return "grid-cols-2 md:grid-cols-6";
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 xs:space-y-5 sm:space-y-6">
      {/* Page Header */}
      <div className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-3 xs:gap-4">
        <div className="min-w-0">
          <h1 className="text-lg xs:text-xl sm:text-2xl font-bold text-foreground" data-testid="text-settings-title">
            Settings
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            {canAccessSystemSettings 
              ? "Manage your preferences and organization settings" 
              : "Manage your personal preferences"
            }
          </p>
        </div>
      </div>

      <Tabs defaultValue="personal" className="w-full">
        <TabsList className={`grid w-full gap-2 h-auto items-start ${getGridCols()}`}>
          {/* Personal Settings - Always visible */}
          <TabsTrigger value="personal" data-testid="tab-personal" className="w-full">
            <User className="w-4 h-4 mr-2" />
            Personal
          </TabsTrigger>

          {/* System Settings - Only for admins */}
          {canAccessSystemSettings && (
            <>
              <TabsTrigger value="organization" data-testid="tab-organization" className="w-full">
                <Building className="w-4 h-4 mr-2" />
                Organization
              </TabsTrigger>
              <TabsTrigger value="users" data-testid="tab-users" className="w-full">
                <Users className="w-4 h-4 mr-2" />
                Users
              </TabsTrigger>
              <TabsTrigger value="hiring-stages" data-testid="tab-hiring-stages" className="w-full">
                <Target className="w-4 h-4 mr-2" />
                Hiring
              </TabsTrigger>
              <TabsTrigger value="authentication" data-testid="tab-authentication" className="w-full">
                <Key className="w-4 h-4 mr-2" />
                Authentication
              </TabsTrigger>
              <TabsTrigger value="system" data-testid="tab-system" className="w-full">
                <SettingsIcon className="w-4 h-4 mr-2" />
                System
              </TabsTrigger>
            </>
          )}
        </TabsList>

        {/* Tab Contents */}
        <TabsContent value="personal" className="mt-6">
          <PersonalSettingsTab />
        </TabsContent>

        {canAccessSystemSettings && (
          <>
            <TabsContent value="organization" className="mt-6">
              <OrganizationTab />
            </TabsContent>
            <TabsContent value="users" className="mt-6">
              <UsersTab />
            </TabsContent>
            <TabsContent value="hiring-stages" className="mt-6">
              <HiringStagesTab />
            </TabsContent>
            <TabsContent value="authentication" className="mt-6">
              <AuthenticationTab />
            </TabsContent>
            <TabsContent value="system" className="mt-6">
              <SystemTab />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
