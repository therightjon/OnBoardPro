import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/shared/components/ui/toaster";
import { Toaster as SonnerToaster } from "sonner";
import { TooltipProvider } from "@/shared/components/ui/tooltip";
import { AuthProvider } from "@/features/auth/hooks/use-auth";
import { ThemeProvider } from "@/shared/components/layout/theme-provider";
import { ProtectedRoute } from "./lib/protected-route";
import { Sidebar } from "@/shared/components/layout/sidebar";
import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Sheet, SheetContent } from "@/shared/components/ui/sheet";
import { Menu } from "lucide-react";

// Import pages from new structure
import NotFound from "./app/not-found";
import AuthPage from "./app/auth/page";
import Dashboard from "./app/(dashboard)/page";
import CandidatesPage from "./app/(dashboard)/candidates/page";
import CandidateDetailPage from "./app/(dashboard)/candidates/[id]/page";
import MyTasksPage from "./app/(dashboard)/tasks/mine/page";
import TemplatesPage from "./app/(dashboard)/templates/page";
import TemplateDetailPage from "./app/(dashboard)/templates/[id]/page";
import TaskDefinitionsPage from "./app/(dashboard)/tasks/page";
import AnalyticsPage from "./app/(dashboard)/analytics/page";
import SettingsPage from "./app/(dashboard)/settings/page";
import NotificationsPage from "./app/(dashboard)/notifications/page";

function Header({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <header className="sticky top-0 z-40 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b md:hidden">
      <div className="container flex h-14 items-center justify-between px-3 xs:px-4 sm:px-6">
        <h1 className="text-base xs:text-lg sm:text-xl font-semibold text-foreground">OnboardPro</h1>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation" onClick={onMenuClick} data-testid="button-mobile-menu">
          <Menu className="w-5 h-5" />
        </Button>
      </div>
    </header>
  );
}

function AppLayout({ children }: { children: React.ReactNode }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <>
      {/* Skip link for accessibility */}
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      
      <div className="min-h-screen grid md:grid-cols-[260px_1fr]">
        {/* Sidebar for desktop */}
        <aside className="hidden md:flex border-r md:sticky md:top-0 md:h-screen">
          <Sidebar />
        </aside>

        <div className="flex min-h-screen flex-col">
          <Header onMenuClick={() => setIsMobileMenuOpen(true)} />
          
          <main id="main" className="flex-1 container mx-auto px-3 xs:px-4 sm:px-6 md:px-8 py-3 xs:py-4 sm:py-6">
            {children}
          </main>
        </div>

        {/* Mobile navigation sheet */}
        <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
          <SheetContent side="left" className="p-0 w-[85vw] max-w-sm">
            <Sidebar onNavigate={() => setIsMobileMenuOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppLayout>
      {children}
    </AppLayout>
  );
}

function Router() {
  return (
    <Switch>
      {/* Public routes */}
      <Route path="/auth" component={AuthPage} />
      
      {/* Protected routes */}
      <ProtectedRoute path="/" component={() => (
        <ProtectedLayout>
          <Dashboard />
        </ProtectedLayout>
      )} />
      
      <ProtectedRoute path="/candidates" component={() => (
        <ProtectedLayout>
          <CandidatesPage />
        </ProtectedLayout>
      )} />
      
      <ProtectedRoute path="/candidates/:id" component={() => (
        <ProtectedLayout>
          <CandidateDetailPage />
        </ProtectedLayout>
      )} />
      
      <ProtectedRoute path="/tasks" component={() => (
        <ProtectedLayout>
          <TaskDefinitionsPage />
        </ProtectedLayout>
      )} />
      
      <ProtectedRoute path="/tasks/mine" component={() => (
        <ProtectedLayout>
          <MyTasksPage />
        </ProtectedLayout>
      )} />
      
      <ProtectedRoute path="/templates" component={() => (
        <ProtectedLayout>
          <TemplatesPage />
        </ProtectedLayout>
      )} />
      
      <ProtectedRoute path="/templates/:id" component={() => (
        <ProtectedLayout>
          <TemplateDetailPage />
        </ProtectedLayout>
      )} />
      
      <ProtectedRoute path="/analytics" component={() => (
        <ProtectedLayout>
          <AnalyticsPage />
        </ProtectedLayout>
      )} />
      
      <ProtectedRoute path="/settings" component={() => (
        <ProtectedLayout>
          <SettingsPage />
        </ProtectedLayout>
      )} />

      <ProtectedRoute path="/notifications" component={() => (
        <ProtectedLayout>
          <NotificationsPage />
        </ProtectedLayout>
      )} />
      
      {/* Fallback to 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="onboardpro-ui-theme">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <SonnerToaster richColors />
            <Router />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
