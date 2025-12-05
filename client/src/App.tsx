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
import { useState, lazy, Suspense } from "react";
import { Button } from "@/shared/components/ui/button";
import { Sheet, SheetContent } from "@/shared/components/ui/sheet";
import { Menu, Loader2 } from "lucide-react";

// Lazy load pages for code splitting - reduces initial bundle size
const NotFound = lazy(() => import("./app/not-found"));
const AuthPage = lazy(() => import("./app/auth/page"));
const Dashboard = lazy(() => import("./app/(dashboard)/page"));
const CandidatesPage = lazy(() => import("./app/(dashboard)/candidates/page"));
const CandidateDetailPage = lazy(() => import("./app/(dashboard)/candidates/[id]/page"));
const MyTasksPage = lazy(() => import("./app/(dashboard)/tasks/mine/page"));
const TemplatesPage = lazy(() => import("./app/(dashboard)/templates/page"));
const TemplateDetailPage = lazy(() => import("./app/(dashboard)/templates/[id]/page"));
const TaskDefinitionsPage = lazy(() => import("./app/(dashboard)/tasks/page"));
const AnalyticsPage = lazy(() => import("./app/(dashboard)/analytics/page"));
const SettingsPage = lazy(() => import("./app/(dashboard)/settings/page"));
const NotificationsPage = lazy(() => import("./app/(dashboard)/notifications/page"));

// Loading fallback component
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

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
      <Suspense fallback={<PageLoader />}>
        {children}
      </Suspense>
    </AppLayout>
  );
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
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
    </Suspense>
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
